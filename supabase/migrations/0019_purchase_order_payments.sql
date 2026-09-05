-- 0019_purchase_order_payments.sql
-- Track payments made against purchase orders. Each payment can
-- either come from the cash register (counter / bank) or be
-- recorded as credit (we owe the supplier — shown in supplier
-- outstanding balance).
--
-- The payment row is the source of truth for "what was paid when"
-- (audit trail). It also optionally writes a cash_register row so
-- the register balance reflects money going out for supplier
-- payments.
--
-- Idempotent: every CREATE uses IF NOT EXISTS.

-- ── 1. payment_method enum ─────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_type where typname = 'supplier_payment_method') then
    create type public.supplier_payment_method as enum (
      'cash',          -- paid from the counter drawer
      'bank',          -- paid from the bank (UPI / card / online)
      'credit',        -- on credit — supplier balance increases
      'adjustment'     -- manual adjustment (write-off, dispute, etc.)
    );
  end if;
end$$;

-- ── 2. purchase_order_payments table ───────────────────────────────
create table if not exists public.purchase_order_payments (
  id                    uuid primary key default gen_random_uuid(),
  purchase_order_id     uuid not null references public.purchase_orders(id) on delete restrict,
  shop_id               uuid not null references public.shops(id) on delete restrict,
  amount                numeric(12, 2) not null check (amount > 0),
  method                public.supplier_payment_method not null,
  notes                 text,
  paid_at               timestamptz not null default now(),
  paid_by               uuid not null references public.profiles(id),
  -- Soft link to the cash_register row this payment created (if any).
  register_entry_id     uuid references public.cash_register(id) on delete set null,
  -- Idempotency: if the client retries the same payment, the
  -- client_request_id is the same and we reject the duplicate.
  client_request_id     text unique
);

create index if not exists purchase_order_payments_po_idx
  on public.purchase_order_payments (purchase_order_id);
create index if not exists purchase_order_payments_shop_paid_idx
  on public.purchase_order_payments (shop_id, paid_at desc);

-- ── 3. RLS ───────────────────────────────────────────────────────────
alter table public.purchase_order_payments enable row level security;

do $$
declare r record;
begin
  for r in select policyname from pg_policies
           where schemaname='public' and tablename='purchase_order_payments' loop
    execute format('drop policy %I on public.purchase_order_payments', r.policyname);
  end loop;
end$$;

create policy "shop members can read purchase_order_payments"
  on public.purchase_order_payments
  for select using (public.is_shop_member(shop_id));

create policy "shop managers can write purchase_order_payments"
  on public.purchase_order_payments
  for insert with check (
    exists (
      select 1 from public.shop_members sm
      where sm.shop_id = purchase_order_payments.shop_id
        and sm.user_id  = auth.uid()
        and sm.role in ('owner', 'manager')
        and sm.status   = 'active'
    )
  );

-- ── 4. supplier_outstanding view (per-supplier running balance) ───
-- For now we aggregate from purchase_order_payments where method='credit'.
-- A more complete implementation would also track credit-issued manually
-- (e.g. a non-PO debt), but for the v1 we just expose what's there.
create or replace view public.supplier_outstanding as
select
  s.id                                                   as supplier_id,
  s.name                                                 as supplier_name,
  coalesce(sum(p.amount) filter (where p.method = 'credit'), 0)::numeric(12, 2) as outstanding
from public.suppliers s
left join public.purchase_orders po on po.supplier_id = s.id
left join public.purchase_order_payments p on p.purchase_order_id = po.id and p.method = 'credit'
where s.is_active = true
group by s.id, s.name
order by outstanding desc, s.name;

-- ── 5. Migration ledger entry ───────────────────────────────────────
do $mig$
begin
  perform public._shelf_mark_migration('0019_purchase_order_payments');
end $mig$;
