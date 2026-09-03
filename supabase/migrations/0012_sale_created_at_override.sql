-- 0012_sale_created_at_override.sql
-- Allow the user to override sales.created_at at checkout and on edit.
-- Useful for backdating a missed sale (e.g. recorded the next morning)
-- or correcting the time of an in-progress sale.
--
-- This is purely additive:
--   * p_created_at parameter on create_sale() — defaults to now() so
--     existing callers (and the SW offline-replay path) keep working.
--   * sales.created_at is updated in-place on PATCH /api/sales/[id].
--   * stock_log rows written for this sale use the same timestamp so
--     analytics reports (which filter on stock_log.created_at) reflect
--     the actual sale time, not when it was typed in.
--   * sale_ref keeps the SALE date (not the entry date) so the human-
--     readable ref is consistent with the timestamp.

-- ── 1. Add p_created_at to create_sale() ────────────────────────────────────
-- The new signature has one extra parameter. We can't use
-- `create or replace` (it would error with "function name is not
-- unique"), so drop the old one first. Both signatures are owned by
-- the script, so this is safe to run on a live DB — any in-flight
-- RPC call would complete before the drop acquires its lock.
drop function if exists public.create_sale(
  uuid, uuid, uuid, text, text,
  numeric, text, numeric, numeric, numeric, numeric, jsonb
);
-- Add a new parameter with a default, so existing callers
-- (and the SW offline-replay path) keep working.
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
  p_items          jsonb,   -- [{product_id, name, sku, qty, unit_price}]
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
  v_ts   timestamptz;   -- the effective timestamp for this sale
  v_item jsonb;
  v_line_total numeric;
  v_cost_at_sale numeric;
begin
  -- Authorisation: caller must be an active member of this shop
  if not public.is_shop_member(p_shop_id) then
    raise exception 'not a member of this shop' using errcode = '42501';
  end if;

  -- Effective timestamp. Caller can override (backdate or correct
  -- clock skew). We keep it server-side so client clock doesn't
  -- matter for analytics.
  v_ts := coalesce(p_created_at, now());

  -- Sale ref: SL-YYYYMMDD-XXXX (XXXX = 4 chars from md5)
  -- Date is the SALE date, not the entry date — keeps the ref
  -- consistent with created_at even on a backdated sale.
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

    -- Decrement stock (only for products that track it)
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

-- Re-grant with the new (longer) signature
grant execute on function public.create_sale(
  uuid, uuid, uuid, text, text,
  numeric, text, numeric, numeric, numeric, numeric, jsonb, timestamptz
) to authenticated;

-- Drop ALL old comments on create_sale (any signature), so we can
-- re-attach to the new signature without ambiguity. The do block
-- runs as SECURITY INVOKER (no definer), so it can read pg_description.
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
  'Atomically create a sale, its line items, and stock decrement entries. '
  'Optional p_created_at overrides the sale timestamp (for backdating).';

-- ── 2. Patch set_sale_timestamp() helper for the PATCH /api/sales/[id] path ─
-- The edit-sale flow updates the sale row in place. We need a way to also
-- bump the related stock_log rows' created_at so analytics stays consistent.
-- Wrapped in a SECURITY DEFINER RPC so we don't need to expose stock_log
-- RLS to the user.
create or replace function public.set_sale_timestamp(
  p_sale_id    uuid,
  p_created_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shop_id uuid;
begin
  select shop_id into v_shop_id
  from public.sales
  where id = p_sale_id;
  if v_shop_id is null then
    raise exception 'sale not found';
  end if;
  if not public.is_shop_member(v_shop_id) then
    raise exception 'not a member of this shop' using errcode = '42501';
  end if;

  update public.sales
    set created_at = p_created_at
  where id = p_sale_id;

  -- Also bump the matching stock_log entries by reference = sale_ref.
  -- (The void/edit flow touches these rows by reference, so this is
  -- the correct join key.)
  update public.stock_log
    set created_at = p_created_at
  where reference = (select sale_ref from public.sales where id = p_sale_id)
    and reason    = 'sale';
end;
$$;

grant execute on function public.set_sale_timestamp(uuid, timestamptz) to authenticated;

comment on function public.set_sale_timestamp is
  'Update sales.created_at (and the matching stock_log rows) for a sale. '
  'Used by the edit-sale flow when the user changes the timestamp.';
