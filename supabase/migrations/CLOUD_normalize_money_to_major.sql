-- CLOUD_normalize_money_to_major.sql
--
-- Run this on the Supabase cloud SQL editor to bring legacy money
-- columns from minor units (×100) into major units (rupees).
--
-- The Directus → Supabase migration stored some price fields in paise
-- (minor units) while leaving sale amounts in rupees (major units), so
-- the same product can show up as `1500` in `products.price` but as
-- `15` in the user's inventory UI when both are formatted with the same
-- /100 conversion. After this migration, every monetary column uses
-- the same major-units convention.
--
-- Three queries, run them in order on the cloud SQL editor:
--
--   1) DRY RUN  —  shows every row the migration would change.
--                  Inspect the output before running the fix.
--   2) FIX      —  actually updates the rows in place.
--   3) VERIFY   —  should return 0 rows (no stragglers left).
--
-- The heuristic for "this row is in minor units" is conservative on
-- purpose: it only matches products whose price AND cost_price are both
-- evenly divisible by 100 AND at least 100. A real product priced at
-- ₹100 is also divisible by 100, so this single check is not enough.
-- The migration also requires that no `sale_items` row references the
-- product, which is the strong signal: live products have sale history
-- with matching values, and that history is what tells us whether the
-- product is in major (matching) or minor (mismatched by 100x).
--
-- In other words: we migrate a product only when (a) the values look
-- like minor units, AND (b) no sale has been recorded against it yet.
-- A product with sales history is left alone; the user can re-price
-- it manually if needed.
--
-- SCOPE: by default this targets the whole `products` table across
-- every shop. To limit to one shop, uncomment the AND clauses in the
-- WHERE blocks below and replace <SHOP_ID> with the shop's uuid.

-- ──────────────────────────────────────────────────────────────────────
-- 1. DRY RUN
-- ──────────────────────────────────────────────────────────────────────
-- Lists every product that *would* be migrated by step 2. Run this
-- first and review the output. The rightmost columns show the values
-- AFTER migration so you can spot anything that looks wrong (e.g. a
-- ₹1500 product that becomes ₹15 would be suspect — gold jewelry or
-- an expensive appliance that you actually do charge 1500 for).

select
  p.id,
  p.shop_id,
  p.name,
  p.price            as old_price,
  round(p.price / 100.0, 2)         as new_price,
  p.cost_price       as old_cost_price,
  round(p.cost_price / 100.0, 2)    as new_cost_price,
  (select count(*) from public.sale_items si where si.product_id = p.id) as sales
from   public.products p
where  p.price         > 100
  and  p.price         % 100 = 0
  and  p.cost_price    > 100
  and  p.cost_price    % 100 = 0
  and  not exists (select 1 from public.sale_items si where si.product_id = p.id)
  -- and p.shop_id = '<SHOP_ID>'   -- uncomment to target one shop
order by p.shop_id, p.name;

-- ──────────────────────────────────────────────────────────────────────
-- 2. FIX
-- ──────────────────────────────────────────────────────────────────────
-- Once step 1's output looks right, run the update. Same predicate as
-- the dry run. Wrapped in a CTE so a future WHERE clause change is
-- symmetric with step 1.

begin;

with candidates as (
  select id, price, cost_price
  from   public.products
  where  price         > 100
    and  price         % 100 = 0
    and  cost_price    > 100
    and  cost_price    % 100 = 0
    and  not exists (select 1 from public.sale_items si where si.product_id = products.id)
    -- and shop_id = '<SHOP_ID>'   -- uncomment to target one shop
  for update
)
update public.products p
set    price      = round(c.price      / 100.0, 2),
       cost_price = round(c.cost_price / 100.0, 2)
from   candidates c
where  p.id = c.id;

-- Also normalize purchase-order line items that have not been received
-- yet (a similar legacy footprint, no stock movement so no sale cross-
-- check is possible). Same /100 heuristic, scoped to line items whose
-- parent order matches the filter.

update public.purchase_order_items poi
set    unit_cost  = round(poi.unit_cost  / 100.0, 2),
       line_total = round(poi.line_total / 100.0, 2)
where  poi.unit_cost  > 100
  and  poi.unit_cost  % 100 = 0
  and  poi.line_total % 100 = 0
  and  poi.quantity_received = 0
  and  exists (
    select 1
    from   public.purchase_orders po
    where  po.id = poi.purchase_order_id
      -- and po.shop_id = '<SHOP_ID>'   -- uncomment to target one shop
  );

commit;

-- ──────────────────────────────────────────────────────────────────────
-- 3. VERIFY
-- ─────────────────────────────────────────────────────────────────────
-- Should return 0 rows. Anything here is a row the heuristic couldn't
-- safely migrate (most likely real expensive products, e.g. ₹1500
-- gold jewelry) — re-price those by hand if needed.

select count(*) as still_suspicious
from   public.products p
where  p.price         > 100
  and  p.price         % 100 = 0
  and  p.cost_price    > 100
  and  p.cost_price    % 100 = 0
  and  not exists (select 1 from public.sale_items si where si.product_id = p.id)
  -- and p.shop_id = '<SHOP_ID>'   -- uncomment to target one shop
;
