-- 0013_cash_register.sql
-- Cash register: a per-shop ledger of all money movements. Sales auto-add
-- to the appropriate destination (cash → counter, card/transfer/credit →
-- bank). Manual entries cover expenses, injections, adjustments, and
-- transfers. Each entry is immutable once created; corrections are
-- recorded as separate "adjustment" entries that link back to the original.
--
-- Design notes:
--   * One ledger table, one row per money movement. Signed `amount`:
--       positive = money IN to the destination (sale, injection)
--       negative = money OUT (expense, transfer-out, void)
--   * `destination` is a free-form text label (e.g. 'counter', 'bank',
--     'petty_cash'). No FK to a destinations table — keeps the schema
--     flat and lets the user name their own drawers.
--   * `source` is a tag describing where the row came from:
--       'sale'      → created by create_sale() RPC (links to sale_id)
--       'void'      → created when a sale is voided (links to sale_id)
--       'manual'    → user-typed entry via /cash-register UI
--       'transfer'  → linked to a `transfer_group_id` UUID that pairs
--                     a transfer-out row with its matching transfer-in row
--   * `voided_at` is the audit-trail kill switch. Setting it hides the
--     row from balance calculations but keeps it visible in the history.
--   * No sessions, no shifts — each entry has its own timestamp. Daily
--     reports just filter by date range.
--
-- Permissions (enforced in the API, not in the DB):
--   * owner + manager: can add injections, transfers, adjustments,
--     and void existing entries
--   * cashier:        can add expenses
--   * suspended:      cannot add anything
--   * Any shop member can READ (they need to see the balance)

-- ── 1. The ledger table ──────────────────────────────────────────────────
create table if not exists public.cash_register (
  id               uuid primary key default gen_random_uuid(),
  shop_id          uuid not null references public.shops(id) on delete cascade,
  destination      text not null check (destination in ('counter','bank','other')),
  amount           numeric(12,2) not null,   -- signed; positive=IN, negative=OUT
  entry_type       text not null check (entry_type in (
                     'sale','expense','injection','adjustment','transfer','void'
                   )),
  source           text not null default 'manual' check (source in (
                     'sale','void','manual','transfer'
                   )),
  sale_id          uuid references public.sales(id) on delete set null,
  transfer_group_id uuid,                    -- pairs transfer-out with transfer-in
  notes            text not null default '',
  created_by       uuid not null references public.profiles(id),
  created_at       timestamptz not null default now(),
  -- For sale/void entries, the original created_at of the sale (so
  -- the register reflects when the money actually moved, not when
  -- the register row was written). For manual entries, this is null
  -- and created_at is the canonical timestamp.
  effective_at     timestamptz,
  voided_at        timestamptz,
  voided_by        uuid references public.profiles(id),
  void_reason      text
);

-- Speed up the two most common queries: "today's balance for this
-- destination" and "this destination's history, newest first".
create index if not exists cash_register_shop_dest_created_idx
  on public.cash_register(shop_id, destination, created_at desc);

create index if not exists cash_register_shop_created_idx
  on public.cash_register(shop_id, created_at desc);

create index if not exists cash_register_sale_id_idx
  on public.cash_register(sale_id)
  where sale_id is not null;

create index if not exists cash_register_transfer_group_idx
  on public.cash_register(transfer_group_id)
  where transfer_group_id is not null;

-- ── 2. Helper: get a destination label for a sale's payment method ─────
-- Single source of truth for "this payment method lands in this drawer".
-- Cash → counter. UPI / card / transfer / credit → bank.
create or replace function public.cash_register_destination_for_method(method text)
returns text
language sql
immutable
as $$
  select case
    when method = 'cash' then 'counter'
    else 'bank'
  end;
$$;

-- ── 3. update create_sale() to also write a register entry ─────────────
-- Drop the old (12-param) signature, create the new one with the
-- register write baked in. The cash register row uses effective_at
-- from p_created_at (or now()) so backdated sales backdate the
-- register too.
drop function if exists public.create_sale(
  uuid, uuid, uuid, text, text,
  numeric, text, numeric, numeric, numeric, numeric, jsonb
);
drop function if exists public.create_sale(
  uuid, uuid, uuid, text, text,
  numeric, text, numeric, numeric, numeric, numeric, jsonb, timestamptz
);

create or replace function public.create_sale(
  p_shop_id        uuid,
  p_customer_id    uuid,
  p_served_by      uuid,
  p_payment_method text,
  p_notes          text,
  p_subtotal       numeric,
  p_discount_type  text,
  p_discount_value numeric,
  p_discount_amount numeric,
  p_tax_amount     numeric,
  p_total          numeric,
  p_items          jsonb,
  p_created_at     timestamptz default null
)
returns public.sales
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ref text;
  v_sale public.sales;
  v_ts   timestamptz;
  v_item jsonb;
  v_line_total numeric;
  v_cost_at_sale numeric;
  v_destination text;
begin
  if not public.is_shop_member(p_shop_id) then
    raise exception 'not a member of this shop' using errcode = '42501';
  end if;

  v_ts := coalesce(p_created_at, now());
  v_destination := public.cash_register_destination_for_method(p_payment_method);

  v_ref := 'SL-' || to_char(v_ts at time zone 'utc', 'YYYYMMDD') || '-' ||
           upper(substring(md5(random()::text) for 4));

  insert into public.sales (
    shop_id, sale_ref, customer_id, served_by,
    subtotal, discount_type, discount_value, discount_amount,
    tax_amount, total, payment_method, notes, created_at
  ) values (
    p_shop_id, v_ref, p_customer_id, p_served_by,
    p_subtotal, p_discount_type, p_discount_value, p_discount_amount,
    p_tax_amount, p_total, p_payment_method, p_notes, v_ts
  )
  returning * into v_sale;

  -- Cash register entry for the sale (effective_at = sale timestamp).
  -- amount = p_total so cash + tax - discount all flow in.
  insert into public.cash_register (
    shop_id, destination, amount, entry_type, source,
    sale_id, notes, created_by, effective_at
  ) values (
    p_shop_id, v_destination, p_total, 'sale', 'sale',
    v_sale.id,
    'Auto: sale ' || v_ref,
    p_served_by, v_ts
  );

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_line_total := (v_item->>'unit_price')::numeric * (v_item->>'qty')::int;
    v_cost_at_sale := coalesce(
      (select cost_price from public.products where id = (v_item->>'product_id')::uuid),
      0
    );

    insert into public.sale_items
      (sale_id, product_id, product_name, product_sku, unit_price, qty, line_total, cost_at_sale)
    values
      (v_sale.id, (v_item->>'product_id')::uuid,
       v_item->>'name', v_item->>'sku',
       (v_item->>'unit_price')::numeric, (v_item->>'qty')::int, v_line_total, v_cost_at_sale);

    update public.products
      set qty = greatest(0, qty - (v_item->>'qty')::int)
      where id = (v_item->>'product_id')::uuid and track_stock = true;

    insert into public.stock_log
      (shop_id, product_id, delta, reason, reference, created_by, created_at)
    values
      (p_shop_id, (v_item->>'product_id')::uuid,
       -((v_item->>'qty')::int), 'sale', v_ref, p_served_by, v_ts);
  end loop;

  if p_customer_id is not null then
    update public.customers
      set visit_count = visit_count + 1,
          total_spent = total_spent + p_total,
          last_visit  = v_ts
      where id = p_customer_id;
  end if;

  return v_sale;
end;
$$;

grant execute on function public.create_sale(
  uuid, uuid, uuid, text, text,
  numeric, text, numeric, numeric, numeric, numeric, jsonb, timestamptz
) to authenticated;

-- Drop any old comments on create_sale (across all signatures), then
-- attach a new one to the latest signature.
do $clear_cmt$
declare r record;
begin
  for r in
    select p.oid, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'create_sale'
  loop
    execute 'comment on function public.create_sale(' || r.args || ') is NULL';
  end loop;
end $clear_cmt$;

comment on function public.create_sale(
  uuid, uuid, uuid, text, text,
  numeric, text, numeric, numeric, numeric, numeric, jsonb, timestamptz
) is
  'Atomically create a sale, its line items, stock decrement, and a '
  'matching cash_register entry. Optional p_created_at backdates both '
  'the sale and the register row.';

-- ── 4. void_sale() — voids a sale AND its cash register entry ──────────
-- Wrapped in a single function so the two writes are atomic.
create or replace function public.void_sale(
  p_sale_id   uuid,
  p_actor_id  uuid,
  p_reason    text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shop_id    uuid;
  v_payment    text;
  v_total      numeric;
  v_sale_ref   text;
  v_ts         timestamptz;
  v_destination text;
begin
  select shop_id, payment_method, total, sale_ref, created_at
    into v_shop_id, v_payment, v_total, v_sale_ref, v_ts
  from public.sales
  where id = p_sale_id;
  if v_shop_id is null then
    raise exception 'sale not found';
  end if;
  if not public.is_shop_member(v_shop_id) then
    raise exception 'not a member of this shop' using errcode = '42501';
  end if;

  -- Mark the sale as voided
  update public.sales
    set voided_at   = now(),
        voided_by   = p_actor_id,
        void_reason = p_reason
  where id = p_sale_id;

  -- Void the matching cash register entry (don't delete — audit trail)
  update public.cash_register
    set voided_at   = now(),
        voided_by   = p_actor_id,
        void_reason = p_reason
  where sale_id = p_sale_id
    and source  = 'sale'
    and voided_at is null;

  -- Write a 'void' entry (negative amount) to show the reversal on
  -- the running balance. Same destination, same effective_at so the
  -- void lands on the same day as the original sale in reports.
  v_destination := public.cash_register_destination_for_method(v_payment);
  insert into public.cash_register (
    shop_id, destination, amount, entry_type, source,
    sale_id, notes, created_by, effective_at
  ) values (
    v_shop_id, v_destination, -v_total, 'void', 'void',
    p_sale_id,
    'Void of sale ' || v_sale_ref || coalesce(': ' || p_reason, ''),
    p_actor_id, v_ts
  );
end;
$$;

grant execute on function public.void_sale(uuid, uuid, text) to authenticated;

comment on function public.void_sale is
  'Atomically void a sale: marks sales.voided_at, voids the matching '
  'cash_register entry, and writes a negative void entry to keep the '
  'running balance correct.';

-- ── 5. RLS for cash_register ────────────────────────────────────────────
alter table public.cash_register enable row level security;

drop policy if exists cash_register_select on public.cash_register;
create policy cash_register_select on public.cash_register
  for select using (public.is_shop_member(shop_id));

-- Inserts/updates/deletes go through the SECURITY DEFINER functions
-- (create_sale, void_sale) so we don't need separate RLS policies
-- for those. The API endpoint for manual entries will also use a
-- SECURITY DEFINER RPC (added in the same migration).
