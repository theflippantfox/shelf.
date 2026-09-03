-- 0014_cash_register_rpcs.sql
-- Manual-entry RPCs for the cash register UI. The create_sale() and
-- void_sale() functions (from 0013) handle the auto entries from
-- sales. This migration adds the user-driven RPCs:
--
--   * log_register_entry() — add an expense / injection / adjustment
--   * transfer_register()  — move money between destinations
--                              (records as a paired IN + OUT with
--                              a shared transfer_group_id)
--   * void_register_entry() — soft-delete a manual entry

-- ── 1. log_register_entry ────────────────────────────────────────────────
-- Adds a single non-sale entry. Used for expenses, injections, and
-- adjustments. The API enforces role checks BEFORE calling this; the
-- RPC itself just trusts the API and validates shape.
create or replace function public.log_register_entry(
  p_shop_id      uuid,
  p_destination  text,
  p_amount       numeric,
  p_entry_type   text,
  p_notes        text,
  p_actor_id     uuid,
  p_effective_at timestamptz default null,
  p_adjusts_id   uuid default null
)
returns public.cash_register
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.cash_register;
  v_source text := 'manual';
begin
  if not public.is_shop_member(p_shop_id) then
    raise exception 'not a member of this shop' using errcode = '42501';
  end if;
  if p_destination not in ('counter','bank','other') then
    raise exception 'invalid destination';
  end if;
  if p_entry_type not in ('expense','injection','adjustment') then
    raise exception 'invalid entry_type for manual entry';
  end if;

  -- Adjustments must link to the row they're correcting
  if p_entry_type = 'adjustment' and p_adjusts_id is null then
    raise exception 'adjustment entries must specify adjusts_id';
  end if;

  insert into public.cash_register (
    shop_id, destination, amount, entry_type, source,
    notes, created_by, effective_at
  ) values (
    p_shop_id, p_destination, p_amount, p_entry_type, v_source,
    coalesce(p_notes, ''), p_actor_id, coalesce(p_effective_at, now())
  )
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.log_register_entry(
  uuid, text, numeric, text, text, uuid, timestamptz, uuid
) to authenticated;

comment on function public.log_register_entry is
  'Add a manual entry to the cash register (expense, injection, or '
  'adjustment). Role checks are done in the API layer; this RPC just '
  'validates shape and writes the row.';

-- ── 2. transfer_register ────────────────────────────────────────────────
-- Moves money from one destination to another. Records as TWO rows
-- sharing a transfer_group_id: a negative row on the source, a
-- positive row on the destination, both with the same effective_at.
-- The amounts cancel out across the shop as a whole (the sum is 0)
-- so transfers don't change the shop's total cash, just the per-
-- destination balance.
create or replace function public.transfer_register(
  p_shop_id      uuid,
  p_from         text,
  p_to           text,
  p_amount       numeric,
  p_notes        text,
  p_actor_id     uuid,
  p_effective_at timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group uuid := gen_random_uuid();
  v_ts    timestamptz := coalesce(p_effective_at, now());
begin
  if not public.is_shop_member(p_shop_id) then
    raise exception 'not a member of this shop' using errcode = '42501';
  end if;
  if p_from = p_to then
    raise exception 'cannot transfer to the same destination';
  end if;
  if p_from not in ('counter','bank','other') or p_to not in ('counter','bank','other') then
    raise exception 'invalid destination';
  end if;
  if p_amount <= 0 then
    raise exception 'amount must be positive';
  end if;

  -- OUT row on the source
  insert into public.cash_register (
    shop_id, destination, amount, entry_type, source,
    transfer_group_id, notes, created_by, effective_at
  ) values (
    p_shop_id, p_from, -p_amount, 'transfer', 'transfer',
    v_group, coalesce(p_notes, '') || ' (out)', p_actor_id, v_ts
  );

  -- IN row on the destination
  insert into public.cash_register (
    shop_id, destination, amount, entry_type, source,
    transfer_group_id, notes, created_by, effective_at
  ) values (
    p_shop_id, p_to, p_amount, 'transfer', 'transfer',
    v_group, coalesce(p_notes, '') || ' (in)', p_actor_id, v_ts
  );
end;
$$;

grant execute on function public.transfer_register(
  uuid, text, text, numeric, text, uuid, timestamptz
) to authenticated;

comment on function public.transfer_register is
  'Move money between cash-register destinations. Records as a paired '
  'IN/OUT pair with a shared transfer_group_id. Net effect on the '
  'shop total is zero; only the per-destination balance changes.';

-- ── 3. void_register_entry ─────────────────────────────────────────────
-- Soft-void a manual entry. Sale/void entries can't be voided here
-- (use void_sale() for those — it handles the paired register writes).
create or replace function public.void_register_entry(
  p_entry_id uuid,
  p_actor_id uuid,
  p_reason   text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shop_id uuid;
  v_source  text;
begin
  select shop_id, source into v_shop_id, v_source
  from public.cash_register
  where id = p_entry_id;
  if v_shop_id is null then
    raise exception 'entry not found';
  end if;
  if v_source <> 'manual' then
    raise exception 'only manual entries can be voided here; use void_sale for sales';
  end if;
  if not public.is_shop_member(v_shop_id) then
    raise exception 'not a member of this shop' using errcode = '42501';
  end if;

  update public.cash_register
    set voided_at   = now(),
        voided_by   = p_actor_id,
        void_reason = p_reason
  where id = p_entry_id;
end;
$$;

grant execute on function public.void_register_entry(uuid, uuid, text) to authenticated;

comment on function public.void_register_entry is
  'Soft-void a manual cash-register entry. The row stays in the table '
  'with voided_at set so the audit trail is preserved; balance queries '
  'exclude voided rows.';

-- ── 4. get_register_balance — small read helper used by the API ───────
-- Returns the current balance per destination for a shop, plus the
-- grand total. Excludes voided rows.
create or replace function public.get_register_balance(p_shop_id uuid)
returns table (destination text, balance numeric, total_balance numeric)
language sql
security definer
set search_path = public
stable
as $$
  with per_dest as (
    select r.destination, coalesce(sum(r.amount), 0) as balance
    from public.cash_register r
    where r.shop_id = p_shop_id
      and r.voided_at is null
    group by r.destination
  ),
  grand as (
    select coalesce(sum(balance), 0) as total_balance from per_dest
  )
  select pd.destination, pd.balance, g.total_balance
  from per_dest pd
  cross join grand g
  order by pd.destination;
$$;

grant execute on function public.get_register_balance(uuid) to authenticated;

comment on function public.get_register_balance is
  'Current cash-register balance per destination for a shop, plus '
  'the grand total across all destinations. Excludes voided rows.';
