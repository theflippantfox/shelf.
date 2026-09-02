-- CLOUD_0009_products_barcode_unique.sql
--
-- Idempotent version of 0009_products_barcode_unique.sql for the
-- cloud DB.  Wraps the index creation in a do-block that skips if
-- the index already exists, so the migration can be re-run safely
-- (e.g. if a partial apply left the index in an inconsistent state).
--
-- The unique index is on (shop_id, barcode) — two different shops
-- can have products with the same barcode, but a single shop can't
-- have two products sharing a barcode.  Nulls are excluded from the
-- index, so products without a barcode (most of them) are unaffected.

do $$
begin
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename  = 'products'
      and indexname  = 'products_shop_id_barcode_unique_idx'
  ) then
    create unique index products_shop_id_barcode_unique_idx
      on public.products (shop_id, barcode)
      where barcode is not null;
  end if;
end $$;
