-- 0004_functions_receive_purchase_order.sql
-- Atomic purchase-order receiving. Updates per-item quantity_received,
-- increments product.qty, writes stock_log and supplier_price_history,
-- recomputes PO subtotal/status.

create or replace function public.receive_purchase_order(
  p_purchase_order_id uuid,
  p_items             jsonb,    -- [{po_item_id, quantity_received, unit_cost, expiry_date?, batch_number?, update_cost_price?}]
  p_tax_amount        numeric default 0,
  p_shipping_cost     numeric default 0,
  p_received_date     date default current_date,
  p_notes             text default null,
  p_received_by       uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_po public.purchase_orders;
  v_in jsonb;
  v_poi public.purchase_order_items;
  v_product public.products;
  v_subtotal numeric := 0;
  v_status text;
  v_all_received boolean := true;
  v_any_received boolean := false;
begin
  -- Load PO and verify membership
  select * into v_po from public.purchase_orders
    where id = p_purchase_order_id for update;
  if v_po.id is null then
    raise exception 'purchase order not found' using errcode = 'P0002';
  end if;
  if not public.is_shop_member(v_po.shop_id) then
    raise exception 'not a member of this shop' using errcode = '42501';
  end if;

  for v_in in select * from jsonb_array_elements(p_items)
  loop
    -- Load the PO item
    select * into v_poi from public.purchase_order_items
      where id = (v_in->>'po_item_id')::uuid for update;
    if v_poi.id is null then
      continue;  -- skip unknown items
    end if;
    if v_poi.purchase_order_id <> v_po.id then
      raise exception 'item % does not belong to purchase order %',
        v_poi.id, v_po.id using errcode = '23514';
    end if;

    -- Update PO item
    update public.purchase_order_items
      set quantity_received = (v_in->>'quantity_received')::int,
          unit_cost         = (v_in->>'unit_cost')::numeric,
          line_total        = (v_in->>'quantity_received')::int * (v_in->>'unit_cost')::numeric
      where id = v_poi.id;

    -- Bump stock for the linked product, if any
    if v_poi.product_id is not null then
      select * into v_product from public.products
        where id = v_poi.product_id for update;

      update public.products
        set qty = v_product.qty + (v_in->>'quantity_received')::int
        where id = v_poi.product_id;

      -- Optionally update cost price
      if (v_in->>'update_cost_price')::boolean then
        update public.products
          set cost_price = (v_in->>'unit_cost')::numeric
          where id = v_poi.product_id;
      end if;

      -- Stock log entry (positive delta for restock)
      insert into public.stock_log
        (shop_id, product_id, delta, reason, reference, purchase_order_id, created_by)
      values
        (v_po.shop_id, v_poi.product_id,
         (v_in->>'quantity_received')::int, 'restock',
         v_po.order_ref, v_po.id, coalesce(p_received_by, v_po.created_by));

      -- Price history entry
      insert into public.supplier_price_history
        (shop_id, supplier_id, product_id, unit_cost, currency_code, purchase_order_id)
      values
        (v_po.shop_id, v_po.supplier_id, v_poi.product_id,
         (v_in->>'unit_cost')::numeric,
         -- Use the shop's currency as fallback if PO has no currency of its own
         (select currency_code from public.shops where id = v_po.shop_id),
         v_po.id);

      -- Optional batch entry
      if v_product.expiry_tracking
         and ((v_in->>'expiry_date') is not null or (v_in->>'batch_number') is not null) then
        insert into public.product_batches
          (shop_id, product_id, purchase_order_item_id, batch_number, expiry_date, quantity_remaining)
        values
          (v_po.shop_id, v_poi.product_id, v_poi.id,
           v_in->>'batch_number', (v_in->>'expiry_date')::date,
           (v_in->>'quantity_received')::int);
      end if;
    end if;
  end loop;

  -- Recompute PO subtotal/status
  for v_poi in select * from public.purchase_order_items
    where purchase_order_id = v_po.id
  loop
    v_subtotal := v_subtotal + v_poi.quantity_received * v_poi.unit_cost;
    if v_poi.quantity_received < v_poi.quantity_ordered then v_all_received := false; end if;
    if v_poi.quantity_received > 0                     then v_any_received := true;  end if;
  end loop;

  v_status := case
    when v_all_received then 'received'
    when v_any_received then 'partial'
    else 'ordered'
  end;

  update public.purchase_orders
    set subtotal      = v_subtotal,
        total_cost    = v_subtotal + p_tax_amount + p_shipping_cost,
        tax_amount    = p_tax_amount,
        shipping_cost = p_shipping_cost,
        status        = v_status,
        received_date = p_received_date,
        notes         = coalesce(p_notes, notes)
    where id = v_po.id;
end;
$$;

grant execute on function public.receive_purchase_order(
  uuid, jsonb, numeric, numeric, date, text, uuid
) to authenticated;

comment on function public.receive_purchase_order is
  'Atomically receive a purchase order: update items, increment stock, write stock_log and supplier_price_history, recompute PO status.';