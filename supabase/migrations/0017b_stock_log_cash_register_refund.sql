-- 0017b_stock_log_cash_register_refund.sql
-- Loosen constraints on stock_log.reason and cash_register.source /
-- entry_type so return-related rows can be written.
--
-- stock_log.reason: add 'return', 'damage', 'expiry' (for damaged /
-- expired items, and for the resellable-restock path which now
-- logs as 'return' so the audit trail is clear).
--
-- cash_register.source: add 'refund' (for negative entries that
-- represent money flowing back to a customer).
--
-- cash_register.entry_type: add 'refund' as a more explicit type
-- than 'sale' (which is still used for the original sale's row).
-- We use 'refund' for return-driven register rows.
--
-- Idempotent: drop and re-add the constraints.

alter table public.stock_log
  drop constraint if exists stock_log_reason_check;
alter table public.stock_log
  add constraint stock_log_reason_check
  check (reason in ('sale','restock','adjustment','void','return','damage','expiry'));

alter table public.cash_register
  drop constraint if exists cash_register_source_check;
alter table public.cash_register
  add constraint cash_register_source_check
  check (source in ('sale','void','manual','transfer','refund','credit_payment'));

alter table public.cash_register
  drop constraint if exists cash_register_entry_type_check;
alter table public.cash_register
  add constraint cash_register_entry_type_check
  check (entry_type in ('sale','expense','injection','adjustment','transfer','void','refund'));

-- Also update the upstream migration so cloud_setup.sql picks this up.

-- ── 7. RLS for cash_register inserts/updates ───────────────────────
-- The original 0013_cash_register.sql only added a SELECT policy
-- because all writes were supposed to go through SECURITY DEFINER
-- RPCs (void_sale, log_register_entry, void_register_entry).
-- The returns API writes a negative register row directly via
-- userClientFromCtx, so we need INSERT / UPDATE policies too.
-- Members can write; the API layer enforces role checks for
-- sensitive operations (voids, refunds over X, etc.).
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename   = 'cash_register'
      and policyname  = 'cash_register_insert'
  ) then
    create policy cash_register_insert on public.cash_register
      for insert with check (public.is_shop_member(shop_id));
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename   = 'cash_register'
      and policyname  = 'cash_register_update'
  ) then
    create policy cash_register_update on public.cash_register
      for update using (public.is_shop_member(shop_id));
  end if;
end$$;

