-- 0009_products_barcode_unique.sql
--
-- Barcode scanning on the PoS page needs sub-millisecond lookups.
-- The barcode column is currently an unindexed text column.  Add a
-- composite unique index on (shop_id, barcode) so:
--   1. Lookups are fast (btree on a text column under typical N)
--   2. Two products in the same shop can't accidentally share a barcode
--
-- NULLs are excluded from unique constraints in Postgres, so products
-- without a barcode (most of them, today) are unaffected.

create unique index products_shop_id_barcode_unique_idx
  on public.products (shop_id, barcode)
  where barcode is not null;
