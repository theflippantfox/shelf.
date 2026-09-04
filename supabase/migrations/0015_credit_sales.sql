-- 0015_credit_sales.sql
-- Add "credit" as a real customer-pending-payment workflow (not just a
-- card payment alias). A credit sale is one where the customer owes the
-- shop money:
--
--   * credit_status = 'paid'     — full amount received at sale time
--                                  (e.g. they paid half now + promised the
--                                  rest tomorrow and we mark it paid because
--                                  the rest was collected offline). Behaves
--                                  like a normal sale from the register's
--                                  POV.
--   * credit_status = 'partial'  — some amount received at sale time, the
--                                  rest is a receivable. The received amount
--                                  lands in the chosen destination (counter/
--                                  bank); the pending portion is NOT in the
--                                  register.
--   * credit_status = 'pending'  — nothing received. Nothing in the register.
--                                  The full amount is a receivable tracked
--                                  only in customers.outstanding_balance.
--
-- Effects at sale creation:
--   * sales.credit_status, credit_amount_paid, credit_due_date are set
--   * cash_register gets AT MOST ONE 'sale' entry: the received amount
--     in the chosen destination (counter/bank). The pending portion is
--     never written to the register.
--   * customers.outstanding_balance is bumped by the credit portion
--     (decremented when the credit is settled later)
--
-- Settling a credit later (via the record_credit_payment RPC):
--   * Writes a single positive register entry in the chosen destination
--     (counter / bank / other) for the paid amount.
--   * Updates the sale's credit_status to 'paid' (or stays 'partial' if
--     a partial payment was made).
--   * Decrements customers.outstanding_balance via the trigger.

-- ── 1. New columns on sales ────────────────────────────────────────────
alter table public.sales
  add column if not exists credit_status        text
    check (credit_status in ('paid','partial','pending')),
  add column if not exists credit_amount_paid   numeric(12,2) not null default 0,
  add column if not exists credit_due_date      date,
  add column if not exists credit_settled_at    timestamptz;

-- Default for non-credit sales: 'paid' (full amount received at sale time).
-- For credit sales, the API sets this explicitly based on the user's choice.
alter table public.sales
  alter column credit_status set default 'paid';

-- Add 'credit' to the cash_register.destination check constraint.
-- The original constraint from 0013 only allows ('counter','bank','other').
-- We need to allow 'credit' for credit sale receivables. Drop and re-add.
alter table public.cash_register
  drop constraint if exists cash_register_destination_check;

alter table public.cash_register
  add constraint cash_register_destination_check
    check (destination in ('counter','bank','other','credit'));

-- Update the destination-for-method helper from 0013. Original maps
-- cash→counter, everything else→bank. We keep that for non-credit
-- payment methods, but route credit sales separately at the RPC
-- layer (create_sale in this migration) so the helper doesn't need
-- to know about credit_status. The function is unchanged; the new
-- behavior lives in create_sale.

-- Speed up the "show me all pending credit sales" queries
create index if not exists sales_credit_status_idx
  on public.sales(shop_id, credit_status, created_at desc)
  where credit_status in ('partial', 'pending');

create index if not exists sales_credit_due_idx
  on public.sales(shop_id, credit_due_date)
  where credit_status in ('partial', 'pending') and credit_due_date is not null;

-- ── 2. Outstanding balance on customers ─────────────────────────────────
-- Maintained by triggers (insert into sales / record_credit_payment /
-- void_sale). Always equals the sum of (total - credit_amount_paid) for
-- all non-paid credit sales for this customer. Denormalized for speed:
-- analytics + the customer page both need this aggregated number.
alter table public.customers
  add column if not exists outstanding_balance numeric(12,2) not null default 0;

-- ── 3. Helper: recompute a customer's outstanding balance ──────────────
-- Called from triggers. Idempotent.
create or replace function public.recompute_customer_balance(p_customer_id uuid)
returns void
language sql
as $$
  update public.customers c
    set outstanding_balance = coalesce((
      select sum(greatest(0, s.total - s.credit_amount_paid))
      from public.sales s
      where s.customer_id = c.id
        and s.voided_at is null
        and s.credit_status in ('partial', 'pending')
    ), 0)
  where c.id = p_customer_id;
$$;

-- ── 4. Trigger: keep customer balance in sync ───────────────────────────
-- Fires on INSERT/UPDATE/DELETE of sales (and on credit_status / amount
-- changes). Recomputes only the affected customer.
create or replace function public.sales_credit_balance_sync()
returns trigger
language plpgsql
as $$
begin
  if (tg_op = 'DELETE') then
    if old.customer_id is not null then
      perform public.recompute_customer_balance(old.customer_id);
    end if;
    return old;
  end if;

  -- On UPDATE, recompute both old and new customer (customer could have
  -- changed via reassign, or the credit_status could have flipped).
  if (tg_op = 'UPDATE') then
    if old.customer_id is not null
       and (old.customer_id is distinct from new.customer_id
            or old.credit_status is distinct from new.credit_status
            or old.credit_amount_paid is distinct from new.credit_amount_paid
            or old.total is distinct from new.total
            or old.voided_at is distinct from new.voided_at) then
      perform public.recompute_customer_balance(old.customer_id);
    end if;
  end if;

  if new.customer_id is not null then
    perform public.recompute_customer_balance(new.customer_id);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sales_credit_balance_sync on public.sales;
create trigger trg_sales_credit_balance_sync
  after insert or update or delete on public.sales
  for each row execute function public.sales_credit_balance_sync();

-- ── 5. Update create_sale() to handle credit ────────────────────────────
-- The new params: p_credit_status, p_credit_amount_paid, p_credit_due_date.
-- For non-credit payment methods, p_credit_status is forced to 'paid'.
-- For credit method: API passes the user-chosen status. The function
-- then writes the appropriate entries to cash_register and updates
-- the customer balance via the trigger.
drop function if exists public.create_sale(
  uuid, uuid, uuid, text, text,
  numeric, text, numeric, numeric, numeric, numeric, jsonb, timestamptz
);
drop function if exists public.create_sale(
  uuid, uuid, uuid, text, text,
  numeric, text, numeric, numeric, numeric, numeric, jsonb, text, numeric, date
);

create or replace function public.create_sale(
  p_shop_id             uuid,
  p_customer_id         uuid,
  p_served_by           uuid,
  p_payment_method      text,
  p_notes               text,
  p_subtotal            numeric,
  p_discount_type       text,
  p_discount_value      numeric,
  p_discount_amount     numeric,
  p_tax_amount          numeric,
  p_total               numeric,
  p_items               jsonb,
  p_created_at          timestamptz default null,
  p_credit_status       text         default 'paid',     -- 'paid' | 'partial' | 'pending'
  p_credit_amount_paid  numeric      default 0,         -- for 'partial': how much was received
  p_credit_due_date     date         default null
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
  v_received_amount numeric := 0;
  v_effective_credit_status text;
begin
  if not public.is_shop_member(p_shop_id) then
    raise exception 'not a member of this shop' using errcode = '42501';
  end if;

  v_ts := coalesce(p_created_at, now());

  -- For non-credit payment methods, force credit_status to 'paid' — the
  -- whole amount was received at sale time.
  if p_payment_method <> 'credit' then
    v_effective_credit_status := 'paid';
    v_received_amount := p_total;
  else
    -- Validate credit inputs
    if p_credit_status not in ('paid','partial','pending') then
      raise exception 'invalid credit_status' using errcode = '22023';
    end if;
    v_effective_credit_status := p_credit_status;
    if p_credit_status = 'paid' then
      v_received_amount := p_total;
    elsif p_credit_status = 'partial' then
      if p_credit_amount_paid < 0 or p_credit_amount_paid >= p_total then
        raise exception 'partial credit_amount_paid must be > 0 and < total' using errcode = '22023';
      end if;
      v_received_amount := p_credit_amount_paid;
    else  -- 'pending'
      v_received_amount := 0;
    end if;
  end if;

  -- The cash destination for the RECEIVED amount: cash→counter, else→bank
  v_destination := public.cash_register_destination_for_method(p_payment_method);

  v_ref := 'SL-' || to_char(v_ts at time zone 'utc', 'YYYYMMDD') || '-' ||
           upper(substring(md5(random()::text) for 4));

  insert into public.sales (
    shop_id, sale_ref, customer_id, served_by,
    subtotal, discount_type, discount_value, discount_amount,
    tax_amount, total, payment_method, notes, created_at,
    credit_status, credit_amount_paid, credit_due_date
  ) values (
    p_shop_id, v_ref, p_customer_id, p_served_by,
    p_subtotal, p_discount_type, p_discount_value, p_discount_amount,
    p_tax_amount, p_total, p_payment_method, p_notes, v_ts,
    v_effective_credit_status, p_credit_amount_paid, p_credit_due_date
  )
  returning * into v_sale;

  -- Cash register entry for the RECEIVED amount (if any).
  -- We only write what was actually paid at sale time. The PENDING
  -- amount is NOT touched here — it's a receivable, not real money
  -- in the till. It's tracked via customers.outstanding_balance
  -- (kept in sync by the trigger) and surfaces on the cash register
  -- page via the outstanding_receivables views / the customers
  -- table. When the customer pays later, record_credit_payment()
  -- writes the positive entry into the chosen destination then.
  if v_received_amount > 0 then
    insert into public.cash_register (
      shop_id, destination, amount, entry_type, source,
      sale_id, notes, created_by, effective_at
    ) values (
      p_shop_id, v_destination, v_received_amount, 'sale', 'sale',
      v_sale.id,
      'Auto: sale ' || v_ref || case when v_effective_credit_status = 'partial'
        then ' (partial — ' || to_char(p_credit_amount_paid, 'FM999990.00') || ' received)'
        else '' end,
      p_served_by, v_ts
    );
  end if;

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

  -- Customer visit + spend. For pending/partial credit, we DON'T add
  -- the full total to total_spent yet — that happens when the credit
  -- is settled. We DO increment visit_count and last_visit.
  if p_customer_id is not null then
    update public.customers
      set visit_count = visit_count + 1,
          total_spent = total_spent + case
            when v_effective_credit_status = 'paid' then p_total
            else p_credit_amount_paid
          end,
          last_visit  = v_ts
    where id = p_customer_id;
  end if;

  return v_sale;
end;
$$;

grant execute on function public.create_sale(
  uuid, uuid, uuid, text, text,
  numeric, text, numeric, numeric, numeric, numeric, jsonb,
  timestamptz, text, numeric, date
) to authenticated;

-- Update the GRANT to match the new signature
do $clear_cmt$ declare args text; begin
  for args in
    select pg_get_function_identity_arguments(p.oid)
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'create_sale'
  loop
    execute 'comment on function public.create_sale(' || args || ') is NULL';
  end loop;
end $clear_cmt$;

comment on function public.create_sale(
  uuid, uuid, uuid, text, text,
  numeric, text, numeric, numeric, numeric, numeric, jsonb,
  timestamptz, text, numeric, date
) is
  'Atomically create a sale, its line items, stock decrement, and a '
  'matching cash_register entry. Optional p_created_at backdates both '
  'the sale and the register row. For payment_method=credit, '
  'p_credit_status (paid/partial/pending) + p_credit_amount_paid + '
  'p_credit_due_date control how the amount is split between the '
  'chosen destination and the credit (receivable) destination.';

-- ── 6. record_credit_payment() — settle a credit later ──────────────────
-- Called when the customer pays back some or all of an outstanding
-- credit. The amount is moved from the 'credit' destination to the
-- chosen real destination (counter/bank). Updates the sale's
-- credit_status, credit_amount_paid, credit_settled_at, and the
-- customer's outstanding_balance (via the trigger).
create or replace function public.record_credit_payment(
  p_sale_id     uuid,
  p_amount      numeric,
  p_destination text,
  p_actor_id    uuid,
  p_notes       text         default null,
  p_payment_at  timestamptz default null
)
returns public.sales
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale        public.sales;
  v_remaining   numeric;
  v_ts          timestamptz := coalesce(p_payment_at, now());
  v_new_status  text;
  v_destination text;
  v_due_text    text;
begin
  select * into v_sale from public.sales where id = p_sale_id;
  if not found then
    raise exception 'sale not found';
  end if;
  if not public.is_shop_member(v_sale.shop_id) then
    raise exception 'not a member of this shop' using errcode = '42501';
  end if;
  if v_sale.payment_method <> 'credit' then
    raise exception 'sale is not a credit sale';
  end if;
  if v_sale.voided_at is not null then
    raise exception 'sale is voided';
  end if;
  if v_sale.credit_status = 'paid' then
    raise exception 'sale is already fully paid';
  end if;
  if p_amount <= 0 then
    raise exception 'amount must be positive';
  end if;

  v_remaining := greatest(0, v_sale.total - v_sale.credit_amount_paid);
  if p_amount > v_remaining then
    raise exception 'amount % exceeds remaining balance %', p_amount, v_remaining;
  end if;

  v_destination := coalesce(p_destination, 'counter');
  -- The destination must be a real drawer (counter / bank / other).
  -- 'credit' is not allowed here because credit sale receivables are
  -- NOT in the register — they're tracked only in customers.outstanding_balance.
  if v_destination not in ('counter','bank','other') then
    raise exception 'invalid destination';
  end if;

  -- 1. Write a single positive register entry in the destination where
  --    the money actually landed (counter / bank / other). The credit
  --    was never in the register in the first place — it was only
  --    tracked in customers.outstanding_balance, which the trigger
  --    automatically decrements below.
  insert into public.cash_register (
    shop_id, destination, amount, entry_type, source,
    sale_id, notes, created_by, effective_at
  ) values (
    v_sale.shop_id, v_destination, p_amount, 'sale', 'sale',
    p_sale_id,
    'Credit payment for sale ' || v_sale.sale_ref || coalesce(': ' || p_notes, ''),
    p_actor_id, v_ts
  );

  -- 2. Update the sale: bump credit_amount_paid, decide new status
  v_new_status := case
    when v_sale.credit_amount_paid + p_amount >= v_sale.total - 0.005 then 'paid'
    else 'partial'
  end;

  update public.sales
    set credit_amount_paid = credit_amount_paid + p_amount,
        credit_status      = v_new_status,
        credit_settled_at   = case when v_new_status = 'paid' then v_ts else credit_settled_at end
  where id = p_sale_id;

  -- 3. The trigger trg_sales_credit_balance_sync handles customer.outstanding_balance.
  -- 4. If the sale is now fully paid, also bump customer.total_spent by the
  --    newly-paid portion. The trigger trg_sales_credit_balance_sync
  --    already cleared the customer's outstanding_balance.
  if v_new_status = 'paid' and v_sale.customer_id is not null then
    update public.customers
      set total_spent = total_spent + p_amount
      where id = v_sale.customer_id;
  end if;

  -- Return the updated sale
  select * into v_sale from public.sales where id = p_sale_id;
  return v_sale;
end;
$$;

grant execute on function public.record_credit_payment(
  uuid, numeric, text, uuid, text, timestamptz
) to authenticated;

comment on function public.record_credit_payment is
  'Settle some or all of a credit sale. Writes the paid amount as a '
  'positive register entry in the chosen destination (counter/bank/other). '
  'Updates credit_status (partial → paid) and customer totals. '
  'Note: the credit was never in the register — receivables are tracked '
  'in customers.outstanding_balance only.';

-- ── 7. Update void_sale() to handle credit reversals ────────────────────
-- When a credit sale is voided, the customer's outstanding_balance is
-- automatically zeroed by the trigger (because voided_at changes).
-- For any cash that was already received at sale time, the existing
-- 'sale' register entry needs to be voided + a negative 'void' entry
-- written to reverse it.
--
-- The void_sale() in 0013 already voids the matched 'sale' register
-- entry and writes a negative 'void' entry. For credit sales under
-- the new behavior, the only register entry is the received amount
-- (if partial or paid-credit); the pending portion is NOT in the
-- register, so the trigger handles it. The existing loop logic
-- still works: it iterates all 'sale'/'void' entries for the sale_id,
-- which is now at most one entry for credit sales.
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
  v_credit_amount_paid numeric;
  r            record;
begin
  select shop_id, payment_method, total, sale_ref, created_at,
         credit_amount_paid
    into v_shop_id, v_payment, v_total, v_sale_ref, v_ts, v_credit_amount_paid
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

  -- Void ALL non-voided cash_register entries linked to this sale
  -- (one in the chosen destination for received, one in 'credit' for
  -- any pending). Then write a matching negative 'void' entry for each.
  for r in
    select id, destination, amount
    from public.cash_register
    where sale_id = p_sale_id
      and source in ('sale','void')
      and voided_at is null
  loop
    -- Void the existing entry
    update public.cash_register
      set voided_at   = now(),
          voided_by   = p_actor_id,
          void_reason = p_reason
    where id = r.id;

    -- Write a negative 'void' entry on the same destination (for the
    -- same effective_at) so the balance is reversed
    insert into public.cash_register (
      shop_id, destination, amount, entry_type, source,
      sale_id, notes, created_by, effective_at
    ) values (
      v_shop_id, r.destination, -r.amount, 'void', 'void',
      p_sale_id,
      'Void of sale ' || v_sale_ref || coalesce(': ' || p_reason, ''),
      p_actor_id, v_ts
    );
  end loop;
end;
$$;

grant execute on function public.void_sale(uuid, uuid, text) to authenticated;

comment on function public.void_sale is
  'Atomically void a sale: marks sales.voided_at, voids all linked '
  'cash_register entries (one per destination), and writes a matching '
  'negative void entry for each to reverse the balance. Handles '
  'credit sales (multiple register entries) correctly.';

-- ── 8. Helper view: outstanding receivables for analytics ──────────────
-- The customer page also computes this; the view is for the analytics
-- page's KPI and the doughnut chart.
create or replace view public.outstanding_receivables_by_customer as
  select
    shop_id,
    customer_id,
    sum(greatest(0, total - credit_amount_paid)) as outstanding
  from public.sales
  where voided_at is null
    and credit_status in ('partial', 'pending')
    and customer_id is not null
  group by shop_id, customer_id;

grant select on public.outstanding_receivables_by_customer to authenticated;

-- ── 9. Helper view: aggregate outstanding per shop (for analytics KPI) ─
create or replace view public.outstanding_receivables_total as
  select shop_id, sum(outstanding) as total_outstanding
  from public.outstanding_receivables_by_customer
  group by shop_id;

grant select on public.outstanding_receivables_total to authenticated;
