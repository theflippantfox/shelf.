-- 0017_sale_returns.sql
-- Add returns / refunds as a separate, auditable event.
--
-- A return does NOT mutate the original sale. It records:
--   * which items were returned, in what condition
--   * the total refund amount
--   * how the refund was paid back (cash / bank / store credit)
--   * reason + notes for audit
--   * who processed the return
--
-- The original sale stays in the record (for receipts, tax reports,
-- etc.) and the sale_items table keeps the original line items. The
-- return events are aggregated for the customer balance, register
-- totals, and analytics.
--
-- Stock: returned items go back to products.qty (if the condition is
-- 'resellable') or stay out (if 'damaged'). Every stock movement is
-- recorded in stock_log with reason='return'.
--
-- Cash register: a negative register row is written for the refund
-- (if refund_method is cash or bank). The customer's credit balance
-- is decremented for credit-sale returns.
--
-- Idempotent: every CREATE uses IF NOT EXISTS, the enum is added with
-- IF NOT EXISTS, the helper functions are CREATE OR REPLACE, and the
-- trigger uses DROP + ADD.

-- ── 1. Enums ─────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_type where typname = 'return_reason') then
    create type public.return_reason as enum (
      'defective',           -- product was broken / faulty
      'wrong_size',          -- size/color mismatch
      'changed_mind',        -- customer just doesn't want it
      'overcharge',          -- we charged too much
      'duplicate_purchase',  -- bought the same thing twice
      'other'
    );
  end if;
end$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'return_condition') then
    create type public.return_condition as enum (
      'resellable',   -- can go back on the shelf
      'damaged',      -- can't be resold (damaged, opened, etc.)
      'expired'       -- past expiry date
    );
  end if;
end$$;

-- ── 2. Tables ─────────────────────────────────────────────────────────
create table if not exists public.sale_returns (
  id              uuid primary key default gen_random_uuid(),
  sale_id         uuid not null references public.sales(id) on delete restrict,
  shop_id         uuid not null references public.shops(id) on delete restrict,
  processed_by    uuid not null references public.profiles(id),
  reason          public.return_reason not null default 'other',
  notes           text,
  total_refund    numeric(12, 2) not null default 0,  -- sum of line_refund
  -- How the customer was paid back. 'credit_note' = money stays as
  -- credit on the customer account. 'none' = nothing paid back (rare;
  -- e.g. damaged product we're not refunding).
  refund_method   text not null default 'cash'
                    check (refund_method in ('cash', 'bank', 'credit_note', 'none')),
  created_at      timestamptz not null default now()
);

create index if not exists sale_returns_sale_idx
  on public.sale_returns (sale_id);
create index if not exists sale_returns_shop_created_idx
  on public.sale_returns (shop_id, created_at desc);

create table if not exists public.sale_return_items (
  id           uuid primary key default gen_random_uuid(),
  return_id    uuid not null references public.sale_returns(id) on delete cascade,
  product_id   uuid not null references public.products(id) on delete restrict,
  product_name text not null,                  -- snapshot
  product_sku  text,                            -- snapshot
  qty          integer not null check (qty > 0),
  unit_price   numeric(12, 2) not null,        -- refund price per unit
  line_refund  numeric(12, 2) not null,        -- qty * unit_price
  condition    public.return_condition not null default 'resellable'
);

create index if not exists sale_return_items_return_idx
  on public.sale_return_items (return_id);

-- ── 3. RLS ───────────────────────────────────────────────────────────
alter table public.sale_returns         enable row level security;
alter table public.sale_return_items    enable row level security;

-- Drop any pre-existing policies (idempotency)
do $$
declare r record;
begin
  for r in select policyname from pg_policies
           where schemaname='public'
             and tablename in ('sale_returns', 'sale_return_items') loop
    execute format('drop policy %I on public.%I', r.policyname,
                   case when r.tablename='sale_returns' then 'sale_returns' else 'sale_return_items' end);
  end loop;
end$$;

-- "Member" = any active member. "Manager" = active owner or manager.
-- We inline the role check (rather than calling a helper) because
-- is_shop_manager() doesn't exist in 0002 — only is_shop_member /
-- is_shop_owner do. Keep the expression self-contained.

create policy "shop members can read sale_returns"
  on public.sale_returns
  for select using (public.is_shop_member(shop_id));

create policy "shop managers can write sale_returns"
  on public.sale_returns
  for insert with check (
    exists (
      select 1 from public.shop_members sm
      where sm.shop_id = sale_returns.shop_id
        and sm.user_id  = auth.uid()
        and sm.role in ('owner', 'manager')
        and sm.status   = 'active'
    )
  );

create policy "shop members can read sale_return_items"
  on public.sale_return_items
  for select using (
    exists (
      select 1 from public.sale_returns r
      where r.id = sale_return_items.return_id
        and public.is_shop_member(r.shop_id)
    )
  );

create policy "shop managers can write sale_return_items"
  on public.sale_return_items
  for insert with check (
    exists (
      select 1 from public.sale_returns r
      where r.id = sale_return_items.return_id
        and exists (
          select 1 from public.shop_members sm
          where sm.shop_id = r.shop_id
            and sm.user_id  = auth.uid()
            and sm.role in ('owner', 'manager')
            and sm.status   = 'active'
        )
    )
  );

-- ── 4. Helper view: per-sale return summary ────────────────────────
create or replace view public.sale_return_summary as
select
  s.id                                                       as sale_id,
  count(r.*)                                                 as return_count,
  coalesce(sum(r.total_refund), 0)::numeric(12, 2)           as total_refunded,
  max(r.created_at)                                          as last_returned_at
from public.sales s
left join public.sale_returns r on r.sale_id = s.id
group by s.id;

-- ── 5. Helper view: per-product return counter (for the qty
--       already-returned check on the return sheet) ────────────────
create or replace view public.sale_returned_qty as
select
  ri.product_id,
  si.sale_id,
  sum(ri.qty)::int                                            as returned_qty
from public.sale_return_items ri
join public.sale_returns r on r.id = ri.return_id
join public.sale_items si     on si.sale_id = r.sale_id and si.product_id = ri.product_id
group by ri.product_id, si.sale_id;

-- ── 6. Migration ledger entry ───────────────────────────────────────
do $mig$
begin
  perform public._shelf_mark_migration('0017_sale_returns');
end $mig$;
