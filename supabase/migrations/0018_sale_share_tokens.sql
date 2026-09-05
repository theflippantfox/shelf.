-- 0018_sale_share_tokens.sql
-- Public shareable links for sale receipts.
--
-- Each sale gets a random `share_token` (UUID). The /share/sale/[token]
-- route is a public, unauthenticated page that shows a slimmed-down
-- view of the receipt (no cost prices, no profit, no internal notes,
-- no returns history, no customer phone/email).
--
-- The token is regenerated on demand via /api/sales/[id]/share — so
-- the shop owner can invalidate an old link by re-sharing (which
-- mints a new token; the old one stops resolving).
--
-- Sharing is OFF by default (sharing_enabled = false). The shop has
-- to opt in per-sale via the Share button, which mints a token and
-- sets the flag to true. Voiding the sale automatically disables
-- sharing (so a voided receipt doesn't keep being viewable).
--
-- Idempotent: each CREATE uses IF NOT EXISTS, the policy is created
-- only when missing.

-- ── 1. Add the columns ───────────────────────────────────────────────
alter table public.sales
  add column if not exists share_token       uuid default gen_random_uuid(),
  add column if not exists sharing_enabled  boolean not null default false;

create unique index if not exists sales_share_token_idx
  on public.sales (share_token)
  where share_token is not null;

-- ── 2. Rotate the share token when a sale is voided ─────────────────
-- (Voiding a sale should immediately invalidate any shareable link
-- that points to it. We do this in the existing void_sale() RPC
-- with one extra line.)

-- The void_sale() function lives in 0013_cash_register.sql. We can't
-- modify CREATE OR REPLACE without re-running the whole function
-- body, so we add a separate trigger that handles voiding cleanup
-- going forward. The trigger fires on UPDATE of voided_at.

create or replace function public.sale_void_cleanup()
returns trigger
language plpgsql
as $$
begin
  -- Disable sharing + rotate the token. The old token stops
  -- resolving, so any printed/shared link no longer works.
  if (tg_op = 'UPDATE' and new.voided_at is not null
      and (old.voided_at is null or old.voided_at <> new.voided_at)) then
    new.share_token      := gen_random_uuid();
    new.sharing_enabled := false;
  end if;
  return new;
end;
$$;

drop trigger if exists sale_void_cleanup_trg on public.sales;
create trigger sale_void_cleanup_trg
  before update on public.sales
  for each row execute function public.sale_void_cleanup();

-- ── 3. RLS for public share lookup ──────────────────────────────────
-- We expose `share_token` and a slimmed-down view to the anon role
-- (the role used by unauthenticated browser sessions hitting the
-- /share/sale/[token] page).
drop policy if exists sales_public_share_select on public.sales;
create policy sales_public_share_select on public.sales
  for select to anon
  using (sharing_enabled = true and share_token is not null);

-- ── 4. Helper view for the public share page ────────────────────────
-- The /share/sale/[token] page only needs a handful of fields.
-- This view is `security_invoker = true` (default) so RLS still
-- applies, and we grant select on it to anon.
create or replace view public.sale_share_view as
select
  s.id,
  s.share_token,
  s.sale_ref,
  s.created_at,
  s.subtotal,
  s.discount_amount,
  s.tax_amount,
  s.total,
  s.payment_method,
  s.notes,                                  -- public notes (e.g. "thanks for shopping!")
  s.voided_at
from public.sales s
where s.sharing_enabled = true and s.share_token is not null;

grant select on public.sale_share_view to anon;

-- ── 5. Migration ledger entry ───────────────────────────────────────
do $mig$
begin
  perform public._shelf_mark_migration('0018_sale_share_tokens');
end $mig$;
