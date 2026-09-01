-- 0006_snapshot_cost_at_sale.sql
-- Snapshot the product's cost_price at sale time so future cost changes
-- (e.g. a restock at a higher cost) don't retroactively change historical
-- profit numbers on the dashboard and analytics.

alter table public.sale_items
  add column if not exists cost_at_sale numeric(10,2);

-- Backfill: set cost_at_sale to the product's current cost_price for any
-- historical sales. This isn't perfectly accurate (the product's cost
-- may have changed) but it's a sensible best-guess and brings historic
-- numbers in line with the "current snapshot" convention going forward.
update public.sale_items si
  set cost_at_sale = coalesce(si.cost_at_sale, p.cost_price)
  from public.products p
  where p.id = si.product_id
    and si.cost_at_sale is null;

-- (Don't make it NOT NULL — the create_sale RPC will be updated separately
-- to write it; pre-RPC sales (if any) keep the backfill above.)