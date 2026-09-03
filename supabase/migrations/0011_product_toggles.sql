-- 0011_product_toggles.sql
-- Two opt-in toggles on products so the user can disable per-item
-- stock tracking and per-item barcode tracking from the inventory form.
--
-- Both default TRUE so existing rows keep their current behavior.
-- track_barcode is backfilled to FALSE for any product that currently
-- has no barcode, so the UI toggle matches reality (otherwise the
-- form would show "Barcode: ON" with an empty field, which is
-- confusing).

alter table public.products
  add column if not exists track_stock   boolean not null default true,
  add column if not exists track_barcode boolean not null default true;

-- Backfill: products without a barcode shouldn't have track_barcode=true
update public.products
   set track_barcode = false
 where barcode is null
   and track_barcode = true;
