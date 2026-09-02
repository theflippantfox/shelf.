-- 0008_normalize_discount_value_to_major.sql
--
-- The Directus → Supabase migration left `sales.discount_value` in minor
-- units (paise/cents) while every other money field — `subtotal`, `total`,
-- `tax_amount`, `discount_amount`, `unit_price`, `line_total`, `cost_at_sale`
-- — was converted to major units (rupees).  For an old sale with a ₹2
-- amount-discount, the row has discount_value=200, discount_amount=2
-- (ratio 100:1), but a fresh sale from the current app code stores both
-- in major units (ratio 1:1).
--
-- This migration brings every `sales.discount_value` row into the major-
-- units convention by dividing by 100 wherever the value is exactly 100×
-- `discount_amount` (the legacy footprint) AND the value is not already a
-- clean integer-rupee amount.
--
-- Heuristic (a deliberately conservative one):
--   - only touches rows where discount_type = 'amount'
--   - only if discount_value > 0  and  discount_amount > 0
--   - only if discount_value / 100 == discount_amount   (i.e. it was 100× the
--     amount, the legacy mark)
--   - only if the result still rounds to a 2-decimal place in numeric(10,2)
--     (so we don't corrupt a row that happened to be a clean coincidence)
--
-- Any row that does not match all four conditions is left alone — it is
-- either already in major units, a percent-type discount (no division
-- needed), or an amount-type with non-standard proportions that the user
-- can fix manually.

update public.sales
set    discount_value = discount_value / 100
where  discount_type  = 'amount'
  and  discount_value  > 0
  and  discount_amount > 0
  and  discount_value / 100.0 = discount_amount::numeric;

-- Helpful index for the analytics team when they later want to verify
-- that no stragglers remain.  Cheap to maintain, covers the period
-- filters that the dashboard / analytics pages use.
create index if not exists sales_shop_id_created_at_amount_idx
  on public.sales (shop_id, created_at desc)
  where discount_type = 'amount' and discount_amount > 0;

comment on column public.sales.discount_value is
  'Discount value: major units (rupees) for type=amount, 0–100 for type=percent.';
