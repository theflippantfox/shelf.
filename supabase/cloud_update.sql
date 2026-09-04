-- =============================================================================
-- Shëlf · Supabase Cloud UPDATE
-- =============================================================================
-- Use this when your Supabase project ALREADY has the Shëlf base schema
-- (products, sales, shop_members, etc.) and you just want to add the
-- newer features: team invites, product toggles, cost snapshot, palettes,
-- barcode unique index, and the sales/Purchase Order RPCs.
--
--   * Use the Supabase SQL Editor in the dashboard
--   * OR: psql "$DATABASE_URL" -f cloud_update.sql
--
-- What this does:
--   1. Creates a `_shelf_migrations` ledger to track what's been applied
--   2. Runs each DELTA migration in order, skipping ones already applied
--   3. NEVER touches existing tables, columns, or data
--   4. Re-asserts grants on the auth.users trigger helper functions
--   5. Refreshes the PostgREST schema cache
--
-- Pre-existing data is NEVER touched. Every DDL is additive or guarded.
-- =============================================================================

-- =============================================================================
-- 0. MIGRATION LEDGER
-- =============================================================================
create table if not exists public._shelf_migrations (
  id          text primary key,
  applied_at  timestamptz not null default now()
);

create or replace function public._shelf_has_migration(ident text)
returns boolean
language sql
stable
as $$
  select exists(select 1 from public._shelf_migrations where id = ident);
$$;

create or replace function public._shelf_mark_migration(ident text)
returns void
language sql
as $$
  insert into public._shelf_migrations(id) values (ident)
  on conflict (id) do nothing;
$$;

-- =============================================================================
-- 1–N. DELTA MIGRATIONS (skipping 0001 + 0002 — those are base schema)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0003_functions_create_sale.sql
-- -----------------------------------------------------------------------------
-- 0003_functions_create_sale.sql
-- Atomic sale creation. Replaces the multi-query sale creation in
-- src/routes/api/sales/+server.ts, which had a race condition between
-- the sale insert and the per-item stock decrements.
--
-- The function is SECURITY DEFINER so it can insert stock_log rows even
-- when the RLS policy on stock_log would otherwise require created_by = auth.uid().
-- Membership is still verified inside via is_shop_member().

do $drop_create_sale$ declare args text; begin for args in select pg_get_function_identity_arguments(p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'create_sale' loop execute 'drop function public.create_sale(' || args || ')'; end loop; end $drop_create_sale$;
create or replace function public.create_sale(
  p_shop_id      uuid,
  p_customer_id  uuid,
  p_served_by    uuid,
  p_payment_method text,
  p_notes        text,
  p_subtotal     numeric,
  p_discount_type text,
  p_discount_value numeric,
  p_discount_amount numeric,
  p_tax_amount   numeric,
  p_total        numeric,
  p_items        jsonb    -- [{product_id, name, sku, qty, unit_price}]
)
returns public.sales
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ref text;
  v_sale public.sales;
  v_item jsonb;
  v_line_total numeric;
  v_cost_at_sale numeric;
begin
  -- Authorisation: caller must be an active member of this shop
  if not public.is_shop_member(p_shop_id) then
    raise exception 'not a member of this shop' using errcode = '42501';
  end if;

  -- Sale ref: SL-YYYYMMDD-XXXX (XXXX = 4 chars from md5)
  v_ref := 'SL-' || to_char(now() at time zone 'utc', 'YYYYMMDD') || '-' ||
           upper(substring(md5(random()::text) for 4));

  insert into public.sales (
    shop_id, sale_ref, customer_id, served_by,
    subtotal, discount_type, discount_value, discount_amount,
    tax_amount, total, payment_method, notes
  ) values (
    p_shop_id, v_ref, p_customer_id, p_served_by,
    p_subtotal, p_discount_type, p_discount_value, p_discount_amount,
    p_tax_amount, p_total, p_payment_method, p_notes
  )
  returning * into v_sale;

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
      where id = (v_item->>'product_id')::uuid;

    insert into public.stock_log
      (shop_id, product_id, delta, reason, reference, created_by)
    values
      (p_shop_id, (v_item->>'product_id')::uuid,
       -((v_item->>'qty')::int), 'sale', v_ref, p_served_by);
  end loop;

  if p_customer_id is not null then
    update public.customers
      set visit_count = visit_count + 1,
          total_spent = total_spent + p_total,
          last_visit  = now()
      where id = p_customer_id;
  end if;

  return v_sale;
end;
$$;

grant execute on function public.create_sale(
  uuid, uuid, uuid, text, text,
  numeric, text, numeric, numeric, numeric, numeric, jsonb
) to authenticated;

-- clear old comments on any signature of public.create_sale
do $clear_cmt$ declare args text; begin
  for args in
    select pg_get_function_identity_arguments(p.oid)
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = split_part('public.create_sale', '.', 1) and p.proname = split_part('public.create_sale', '.', 2)
  loop
    execute 'comment on function public.create_sale(' || args || ') is NULL';
  end loop;
end $clear_cmt$;
-- attach the new comment to the latest signature
comment on function public.create_sale is 'Atomically create a sale, its line items, and stock decrement entries.';

-- Mark as applied (idempotent)
do $mark$
begin
  perform public._shelf_mark_migration('0003_functions_create_sale');
end $mark$;

-- -----------------------------------------------------------------------------
-- 0004_functions_receive_purchase_order.sql
-- -----------------------------------------------------------------------------
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

-- clear old comments on any signature of public.receive_purchase_order
do $clear_cmt$ declare args text; begin
  for args in
    select pg_get_function_identity_arguments(p.oid)
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = split_part('public.receive_purchase_order', '.', 1) and p.proname = split_part('public.receive_purchase_order', '.', 2)
  loop
    execute 'comment on function public.receive_purchase_order(' || args || ') is NULL';
  end loop;
end $clear_cmt$;
-- attach the new comment to the latest signature
comment on function public.receive_purchase_order is 'Atomically receive a purchase order: update items, increment stock, write stock_log and supplier_price_history, recompute PO status.';

-- Mark as applied (idempotent)
do $mark$
begin
  perform public._shelf_mark_migration('0004_functions_receive_purchase_order');
end $mark$;

-- -----------------------------------------------------------------------------
-- 0005_storage_buckets.sql
-- -----------------------------------------------------------------------------
-- 0005_storage_buckets.sql
-- Set up the three image storage buckets for Supabase Storage.
-- The buckets replace the Directus /assets/ endpoint that the old code used.
--
-- Buckets:
--   product-images  → product photos (replaces directus files collection)
--   avatars         → user profile photos
--   bills           → bills / receipts uploaded with sales
--
-- All buckets are private (no public read). Files are accessed via signed
-- URLs generated on demand by the API.
--
-- Local-only for now. When the app moves to Supabase Cloud, this same SQL
-- will run via supabase db push.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('product-images', 'product-images', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('avatars',        'avatars',        false, 2097152, array['image/jpeg', 'image/png', 'image/webp']),
  ('bills',          'bills',          false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update set
  file_size_limit  = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ─── Storage RLS policies ──────────────────────────────────────────────────
-- Bucket is private; access goes through the server using service role.
-- The server validates the user's shop membership before signing a URL.

-- Members can upload to their shop's prefix
drop policy if exists "members_upload_product_images" on storage.objects;
create policy "members_upload_product_images"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'product-images'
  and exists (
    select 1 from public.shop_members
    where user_id = auth.uid()
    and shop_id::text = (storage.foldername(name))[1]
  )
);

drop policy if exists "members_upload_avatars" on storage.objects;
create policy "members_upload_avatars"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'avatars'
  -- avatars are user-scoped, no shop prefix
);

drop policy if exists "members_upload_bills" on storage.objects;
create policy "members_upload_bills"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'bills'
  and exists (
    select 1 from public.shop_members
    where user_id = auth.uid()
    and shop_id::text = (storage.foldername(name))[1]
  )
);

-- All reads happen via service-role server-side; clients use signed URLs
-- rather than direct storage reads. No public read policies here.

-- Mark as applied (idempotent)
do $mark$
begin
  perform public._shelf_mark_migration('0005_storage_buckets');
end $mark$;

-- -----------------------------------------------------------------------------
-- 0006_snapshot_cost_at_sale.sql
-- -----------------------------------------------------------------------------
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

-- Mark as applied (idempotent)
do $mark$
begin
  perform public._shelf_mark_migration('0006_snapshot_cost_at_sale');
end $mark$;

-- -----------------------------------------------------------------------------
-- 0007_palette_id.sql
-- -----------------------------------------------------------------------------
-- Add palette_id to shops so each shop can pick one of the curated
-- design palettes. Existing rows get the default ('graphite-mint').

alter table public.shops
  add column if not exists palette_id text
    not null
    default 'graphite-mint'
    check (palette_id in (
      'graphite-mint',
      'ink-gold',
      'mist-violet',
      'ocean-cobalt',
      'forest-linen',
      'rose-clay'
    ));

-- Drop the old single-color customisation; palettes are now the only
-- way to brand the app. Keep the columns for now (data preserved) but
-- stop reading them in the theme store.
-- (primary_color, sidebar_bg are intentionally NOT dropped here; we'll
--  remove them in a later migration once the picker has been live for
--  a while.)


-- Mark as applied (idempotent)
do $mark$
begin
  perform public._shelf_mark_migration('0007_palette_id');
end $mark$;

-- -----------------------------------------------------------------------------
-- 0008_normalize_discount_value_to_major.sql
-- -----------------------------------------------------------------------------
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


-- Mark as applied (idempotent)
do $mark$
begin
  perform public._shelf_mark_migration('0008_normalize_discount_value_to_major');
end $mark$;

-- -----------------------------------------------------------------------------
-- 0008_palette_id_expand.sql
-- -----------------------------------------------------------------------------
-- Extend the palette_id CHECK constraint to include the six palettes
-- added to the picker (Sandstone, Slate Mono, Sapphire, Sunset Coral,
-- Emerald Noir). Same shape as 0007 — drop & re-add the constraint
-- with the new value list.

alter table public.shops
  drop constraint if exists shops_palette_id_check;

alter table public.shops
  add constraint shops_palette_id_check
    check (palette_id in (
      'graphite-mint',
      'ink-gold',
      'mist-violet',
      'ocean-cobalt',
      'forest-linen',
      'rose-clay',
      'sandstone',
      'slate-mono',
      'sapphire',
      'sunset-coral',
      'emerald-noir'
    ));

-- Mark as applied (idempotent)
do $mark$
begin
  perform public._shelf_mark_migration('0008_palette_id_expand');
end $mark$;

-- -----------------------------------------------------------------------------
-- 0009_products_barcode_unique.sql
-- -----------------------------------------------------------------------------
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

create unique index if not exists products_shop_id_barcode_unique_idx
  on public.products (shop_id, barcode)
  where barcode is not null;


-- Mark as applied (idempotent)
do $mark$
begin
  perform public._shelf_mark_migration('0009_products_barcode_unique');
end $mark$;

-- -----------------------------------------------------------------------------
-- 0010_team_invites.sql
-- -----------------------------------------------------------------------------
-- 0010_team_invites.sql
-- Re-shape team membership so owners can invite existing Shëlf users
-- and the invitee can review & accept/decline before becoming active.
--
-- Existing state:
--   * shop_members.status already accepts 'invited'
--   * is_shop_member() and shop_members_select only let ACTIVE members
--     see the table — so an invited user can't see their own row.
--
-- What this changes:
--   1. Add invited_by (uuid of the inviter) + invited_at (timestamptz).
--   2. Let invited users see their own row in shop_members (so the
--      /invites page can list them).
--   3. Let invited users UPDATE only the status column on their own
--      row (to accept or decline). All other columns stay locked.
--   4. Owners can still DELETE an invite (cancel) — they already have
--      the shop_members_owner_write policy.

alter table public.shop_members
  add column if not exists invited_by uuid
    references public.profiles(id) on delete set null;

alter table public.shop_members
  add column if not exists invited_at timestamptz;

-- Backfill: existing rows that pre-date the invite flow get a sane
-- "invited" timestamp = created_at and a NULL inviter. Active members
-- and owners aren't shown in any invite UI, so this is purely cosmetic.
update public.shop_members
   set invited_at = created_at
 where invited_at is null;

alter table public.shop_members
  alter column invited_at set not null;

create index if not exists shop_members_invited_by_idx
  on public.shop_members(invited_by);

-- =========================================================================
-- Helper: is the current user invited (status='invited') to this shop?
-- =========================================================================
create or replace function public.is_shop_invitee(shop uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists(
    select 1
    from public.shop_members
    where shop_id = shop
      and user_id = auth.uid()
      and status = 'invited'
  );
$$;

-- =========================================================================
-- Update is_shop_member to also treat 'invited' as a "has access" status
-- so the invitee can at least see the shop record (name, slug) while
-- their invite is pending. They still cannot see other shop data
-- because per-table SELECTs on sales/products/etc. continue to call
-- is_shop_member() and we leave those strict — see note below.
-- =========================================================================
create or replace function public.is_shop_member(shop uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists(
    select 1
    from public.shop_members
    where shop_id = shop
      and user_id = auth.uid()
      and status in ('active', 'invited')
  );
$$;

-- =========================================================================
-- Helper: look up a Shëlf user's auth id by email.
-- SECURITY DEFINER + restricted to `service_role` so it's only callable
-- from the server (not from the browser). Used by the team-invite API
-- to verify the typed email belongs to a real account.
-- =========================================================================
create or replace function public.find_user_id_by_email(needle text)
returns uuid
language sql
security definer
set search_path = public, auth
stable
as $$
  select id
  from auth.users
  where lower(email) = lower(needle)
  limit 1;
$$;

-- Restrict: only the service role may call it. Members / anon can't.
revoke all on function public.find_user_id_by_email(text) from public;
grant execute on function public.find_user_id_by_email(text) to service_role;

-- Same idea for the inverse: a list of (id, email) for a set of user ids,
-- used to backfill emails on the team page. (PostgREST can't query auth.users
-- directly because it's not in the public schema.)
create or replace function public.get_user_emails(ids uuid[])
returns table (id uuid, email text)
language sql
security definer
set search_path = public, auth
stable
as $$
  select u.id, u.email
  from auth.users u
  where u.id = any(ids);
$$;

revoke all on function public.get_user_emails(uuid[]) from public;
grant execute on function public.get_user_emails(uuid[]) to service_role;

-- =========================================================================
-- shop_members policies — extend so invited users can see + accept/decline
-- their own invite.
-- =========================================================================

-- Drop the old "only active members see shop_members" policy.
drop policy if exists shop_members_select on public.shop_members;

-- New SELECT: active members of the shop see everyone, AND a user can
-- always see their own row regardless of status (so invited users see
-- their own pending invite).
drop policy if exists shop_members_select on public.shop_members; create policy shop_members_select on public.shop_members
  for select using (
    public.is_shop_member(shop_id)
    or user_id = auth.uid()
  );

-- The existing shop_members_owner_write is fine for owners (insert,
-- update, delete). For invitees we need a narrow UPDATE on their own
-- row, restricted to flipping status to 'active' or 'suspended'.
drop policy if exists shop_members_invitee_accept on public.shop_members;

drop policy if exists shop_members_invitee_accept on public.shop_members; create policy shop_members_invitee_accept on public.shop_members
  for update using (
    user_id = auth.uid() and status = 'invited'
  )
  with check (
    user_id = auth.uid() and status in ('active', 'suspended')
  );


-- Mark as applied (idempotent)
do $mark$
begin
  perform public._shelf_mark_migration('0010_team_invites');
end $mark$;

-- -----------------------------------------------------------------------------
-- 0011_product_toggles.sql
-- -----------------------------------------------------------------------------
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


-- Mark as applied (idempotent)
do $mark$
begin
  perform public._shelf_mark_migration('0011_product_toggles');
end $mark$;

-- -----------------------------------------------------------------------------
-- 0012_sale_created_at_override.sql
-- -----------------------------------------------------------------------------
-- 0012_sale_created_at_override.sql
-- Allow the user to override sales.created_at at checkout and on edit.
-- Useful for backdating a missed sale (e.g. recorded the next morning)
-- or correcting the time of an in-progress sale.
--
-- This is purely additive:
--   * p_created_at parameter on create_sale() — defaults to now() so
--     existing callers (and the SW offline-replay path) keep working.
--   * sales.created_at is updated in-place on PATCH /api/sales/[id].
--   * stock_log rows written for this sale use the same timestamp so
--     analytics reports (which filter on stock_log.created_at) reflect
--     the actual sale time, not when it was typed in.
--   * sale_ref keeps the SALE date (not the entry date) so the human-
--     readable ref is consistent with the timestamp.

-- ── 1. Add p_created_at to create_sale() ────────────────────────────────────
-- The new signature has one extra parameter. We can't use
-- `create or replace` (it would error with "function name is not
-- unique"), so drop the old one first. Both signatures are owned by
-- the script, so this is safe to run on a live DB — any in-flight
-- RPC call would complete before the drop acquires its lock.
do $drop_create_sale$ declare args text; begin for args in select pg_get_function_identity_arguments(p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'create_sale' loop execute 'drop function public.create_sale(' || args || ')'; end loop; end $drop_create_sale$;

-- Add a new parameter with a default, so existing callers
-- (and the SW offline-replay path) keep working.
do $drop_create_sale$ declare args text; begin for args in select pg_get_function_identity_arguments(p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'create_sale' loop execute 'drop function public.create_sale(' || args || ')'; end loop; end $drop_create_sale$;
create or replace function public.create_sale(
  p_shop_id        uuid,
  p_customer_id    uuid,
  p_served_by      uuid,
  p_payment_method text,
  p_notes          text,
  p_subtotal       numeric,
  p_discount_type  text,
  p_discount_value numeric,
  p_discount_amount numeric,
  p_tax_amount     numeric,
  p_total          numeric,
  p_items          jsonb,   -- [{product_id, name, sku, qty, unit_price}]
  p_created_at     timestamptz default null
)
returns public.sales
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ref text;
  v_sale public.sales;
  v_ts   timestamptz;   -- the effective timestamp for this sale
  v_item jsonb;
  v_line_total numeric;
  v_cost_at_sale numeric;
begin
  -- Authorisation: caller must be an active member of this shop
  if not public.is_shop_member(p_shop_id) then
    raise exception 'not a member of this shop' using errcode = '42501';
  end if;

  -- Effective timestamp. Caller can override (backdate or correct
  -- clock skew). We keep it server-side so client clock doesn't
  -- matter for analytics.
  v_ts := coalesce(p_created_at, now());

  -- Sale ref: SL-YYYYMMDD-XXXX (XXXX = 4 chars from md5)
  -- Date is the SALE date, not the entry date — keeps the ref
  -- consistent with created_at even on a backdated sale.
  v_ref := 'SL-' || to_char(v_ts at time zone 'utc', 'YYYYMMDD') || '-' ||
           upper(substring(md5(random()::text) for 4));

  insert into public.sales (
    shop_id, sale_ref, customer_id, served_by,
    subtotal, discount_type, discount_value, discount_amount,
    tax_amount, total, payment_method, notes, created_at
  ) values (
    p_shop_id, v_ref, p_customer_id, p_served_by,
    p_subtotal, p_discount_type, p_discount_value, p_discount_amount,
    p_tax_amount, p_total, p_payment_method, p_notes, v_ts
  )
  returning * into v_sale;

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

    -- Decrement stock (only for products that track it)
    update public.products
      set qty = greatest(0, qty - (v_item->>'qty')::int)
      where id = (v_item->>'product_id')::uuid and track_stock = true;

    insert into public.stock_log
      (shop_id, product_id, delta, reason, reference, created_by, created_at)
    values
      (p_shop_id, (v_item->>'product_id')::uuid,
       -((v_item->>'qty')::int), 'sale', v_ref, p_served_by, v_ts);
  end loop;

  if p_customer_id is not null then
    update public.customers
      set visit_count = visit_count + 1,
          total_spent = total_spent + p_total,
          last_visit  = v_ts
      where id = p_customer_id;
  end if;

  return v_sale;
end;
$$;

-- Re-grant with the new (longer) signature
grant execute on function public.create_sale(
  uuid, uuid, uuid, text, text,
  numeric, text, numeric, numeric, numeric, numeric, jsonb, timestamptz
) to authenticated;

-- Drop ALL old comments on create_sale (any signature), so we can
-- re-attach to the new signature without ambiguity. The do block
-- runs as SECURITY INVOKER (no definer), so it can read pg_description.
do $clear_cmt$
declare r record;
begin
  for r in
    select p.oid, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'create_sale'
  loop
    execute 'comment on function public.create_sale(' || r.args || ') is NULL';
  end loop;
end $clear_cmt$;

comment on function public.create_sale(
  uuid, uuid, uuid, text, text,
  numeric, text, numeric, numeric, numeric, numeric, jsonb, timestamptz
) is
  'Atomically create a sale, its line items, and stock decrement entries. '
  'Optional p_created_at overrides the sale timestamp (for backdating).';

-- ── 2. Patch set_sale_timestamp() helper for the PATCH /api/sales/[id] path ─
-- The edit-sale flow updates the sale row in place. We need a way to also
-- bump the related stock_log rows' created_at so analytics stays consistent.
-- Wrapped in a SECURITY DEFINER RPC so we don't need to expose stock_log
-- RLS to the user.
do $drop_set_sale_timestamp$ declare args text; begin for args in select pg_get_function_identity_arguments(p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'set_sale_timestamp' loop execute 'drop function public.set_sale_timestamp(' || args || ')'; end loop; end $drop_set_sale_timestamp$;
create or replace function public.set_sale_timestamp(
  p_sale_id    uuid,
  p_created_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shop_id uuid;
begin
  select shop_id into v_shop_id
  from public.sales
  where id = p_sale_id;
  if v_shop_id is null then
    raise exception 'sale not found';
  end if;
  if not public.is_shop_member(v_shop_id) then
    raise exception 'not a member of this shop' using errcode = '42501';
  end if;

  update public.sales
    set created_at = p_created_at
  where id = p_sale_id;

  -- Also bump the matching stock_log entries by reference = sale_ref.
  -- (The void/edit flow touches these rows by reference, so this is
  -- the correct join key.)
  update public.stock_log
    set created_at = p_created_at
  where reference = (select sale_ref from public.sales where id = p_sale_id)
    and reason    = 'sale';
end;
$$;

grant execute on function public.set_sale_timestamp(uuid, timestamptz) to authenticated;

-- clear old comments on any signature of public.set_sale_timestamp
do $clear_cmt$ declare args text; begin
  for args in
    select pg_get_function_identity_arguments(p.oid)
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = split_part('public.set_sale_timestamp', '.', 1) and p.proname = split_part('public.set_sale_timestamp', '.', 2)
  loop
    execute 'comment on function public.set_sale_timestamp(' || args || ') is NULL';
  end loop;
end $clear_cmt$;
-- attach the new comment to the latest signature
comment on function public.set_sale_timestamp is 'Update sales.created_at (and the matching stock_log rows) for a sale. '
  'Used by the edit-sale flow when the user changes the timestamp.';


-- Mark as applied (idempotent)
do $mark$
begin
  perform public._shelf_mark_migration('0012_sale_created_at_override');
end $mark$;

-- -----------------------------------------------------------------------------
-- 0013_cash_register.sql
-- -----------------------------------------------------------------------------
-- 0013_cash_register.sql
-- Cash register: a per-shop ledger of all money movements. Sales auto-add
-- to the appropriate destination (cash → counter, card/transfer/credit →
-- bank). Manual entries cover expenses, injections, adjustments, and
-- transfers. Each entry is immutable once created; corrections are
-- recorded as separate "adjustment" entries that link back to the original.
--
-- Design notes:
--   * One ledger table, one row per money movement. Signed `amount`:
--       positive = money IN to the destination (sale, injection)
--       negative = money OUT (expense, transfer-out, void)
--   * `destination` is a free-form text label (e.g. 'counter', 'bank',
--     'petty_cash'). No FK to a destinations table — keeps the schema
--     flat and lets the user name their own drawers.
--   * `source` is a tag describing where the row came from:
--       'sale'      → created by create_sale() RPC (links to sale_id)
--       'void'      → created when a sale is voided (links to sale_id)
--       'manual'    → user-typed entry via /cash-register UI
--       'transfer'  → linked to a `transfer_group_id` UUID that pairs
--                     a transfer-out row with its matching transfer-in row
--   * `voided_at` is the audit-trail kill switch. Setting it hides the
--     row from balance calculations but keeps it visible in the history.
--   * No sessions, no shifts — each entry has its own timestamp. Daily
--     reports just filter by date range.
--
-- Permissions (enforced in the API, not in the DB):
--   * owner + manager: can add injections, transfers, adjustments,
--     and void existing entries
--   * cashier:        can add expenses
--   * suspended:      cannot add anything
--   * Any shop member can READ (they need to see the balance)

-- ── 1. The ledger table ──────────────────────────────────────────────────
create table if not exists public.cash_register (
  id               uuid primary key default gen_random_uuid(),
  shop_id          uuid not null references public.shops(id) on delete cascade,
  destination      text not null check (destination in ('counter','bank','other')),
  amount           numeric(12,2) not null,   -- signed; positive=IN, negative=OUT
  entry_type       text not null check (entry_type in (
                     'sale','expense','injection','adjustment','transfer','void'
                   )),
  source           text not null default 'manual' check (source in (
                     'sale','void','manual','transfer'
                   )),
  sale_id          uuid references public.sales(id) on delete set null,
  transfer_group_id uuid,                    -- pairs transfer-out with transfer-in
  notes            text not null default '',
  created_by       uuid not null references public.profiles(id),
  created_at       timestamptz not null default now(),
  -- For sale/void entries, the original created_at of the sale (so
  -- the register reflects when the money actually moved, not when
  -- the register row was written). For manual entries, this is null
  -- and created_at is the canonical timestamp.
  effective_at     timestamptz,
  voided_at        timestamptz,
  voided_by        uuid references public.profiles(id),
  void_reason      text
);

-- Speed up the two most common queries: "today's balance for this
-- destination" and "this destination's history, newest first".
create index if not exists cash_register_shop_dest_created_idx
  on public.cash_register(shop_id, destination, created_at desc);

create index if not exists cash_register_shop_created_idx
  on public.cash_register(shop_id, created_at desc);

create index if not exists cash_register_sale_id_idx
  on public.cash_register(sale_id)
  where sale_id is not null;

create index if not exists cash_register_transfer_group_idx
  on public.cash_register(transfer_group_id)
  where transfer_group_id is not null;

-- ── 2. Helper: get a destination label for a sale's payment method ─────
-- Single source of truth for "this payment method lands in this drawer".
-- Cash → counter. UPI / card / transfer / credit → bank.
create or replace function public.cash_register_destination_for_method(method text)
returns text
language sql
immutable
as $$
  select case
    when method = 'cash' then 'counter'
    else 'bank'
  end;
$$;

-- ── 3. update create_sale() to also write a register entry ─────────────
-- Drop the old (12-param) signature, create the new one with the
-- register write baked in. The cash register row uses effective_at
-- from p_created_at (or now()) so backdated sales backdate the
-- register too.
do $drop_create_sale$ declare args text; begin for args in select pg_get_function_identity_arguments(p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'create_sale' loop execute 'drop function public.create_sale(' || args || ')'; end loop; end $drop_create_sale$;

do $drop_create_sale$ declare args text; begin for args in select pg_get_function_identity_arguments(p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'create_sale' loop execute 'drop function public.create_sale(' || args || ')'; end loop; end $drop_create_sale$;


do $drop_create_sale$ declare args text; begin for args in select pg_get_function_identity_arguments(p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'create_sale' loop execute 'drop function public.create_sale(' || args || ')'; end loop; end $drop_create_sale$;
create or replace function public.create_sale(
  p_shop_id        uuid,
  p_customer_id    uuid,
  p_served_by      uuid,
  p_payment_method text,
  p_notes          text,
  p_subtotal       numeric,
  p_discount_type  text,
  p_discount_value numeric,
  p_discount_amount numeric,
  p_tax_amount     numeric,
  p_total          numeric,
  p_items          jsonb,
  p_created_at     timestamptz default null
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
begin
  if not public.is_shop_member(p_shop_id) then
    raise exception 'not a member of this shop' using errcode = '42501';
  end if;

  v_ts := coalesce(p_created_at, now());
  v_destination := public.cash_register_destination_for_method(p_payment_method);

  v_ref := 'SL-' || to_char(v_ts at time zone 'utc', 'YYYYMMDD') || '-' ||
           upper(substring(md5(random()::text) for 4));

  insert into public.sales (
    shop_id, sale_ref, customer_id, served_by,
    subtotal, discount_type, discount_value, discount_amount,
    tax_amount, total, payment_method, notes, created_at
  ) values (
    p_shop_id, v_ref, p_customer_id, p_served_by,
    p_subtotal, p_discount_type, p_discount_value, p_discount_amount,
    p_tax_amount, p_total, p_payment_method, p_notes, v_ts
  )
  returning * into v_sale;

  -- Cash register entry for the sale (effective_at = sale timestamp).
  -- amount = p_total so cash + tax - discount all flow in.
  insert into public.cash_register (
    shop_id, destination, amount, entry_type, source,
    sale_id, notes, created_by, effective_at
  ) values (
    p_shop_id, v_destination, p_total, 'sale', 'sale',
    v_sale.id,
    'Auto: sale ' || v_ref,
    p_served_by, v_ts
  );

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

  if p_customer_id is not null then
    update public.customers
      set visit_count = visit_count + 1,
          total_spent = total_spent + p_total,
          last_visit  = v_ts
      where id = p_customer_id;
  end if;

  return v_sale;
end;
$$;

grant execute on function public.create_sale(
  uuid, uuid, uuid, text, text,
  numeric, text, numeric, numeric, numeric, numeric, jsonb, timestamptz
) to authenticated;

-- Drop any old comments on create_sale (across all signatures), then
-- attach a new one to the latest signature.
do $clear_cmt$
declare r record;
begin
  for r in
    select p.oid, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'create_sale'
  loop
    execute 'comment on function public.create_sale(' || r.args || ') is NULL';
  end loop;
end $clear_cmt$;

comment on function public.create_sale(
  uuid, uuid, uuid, text, text,
  numeric, text, numeric, numeric, numeric, numeric, jsonb, timestamptz
) is
  'Atomically create a sale, its line items, stock decrement, and a '
  'matching cash_register entry. Optional p_created_at backdates both '
  'the sale and the register row.';

-- ── 4. void_sale() — voids a sale AND its cash register entry ──────────
-- Wrapped in a single function so the two writes are atomic.
do $drop_void_sale$ declare args text; begin for args in select pg_get_function_identity_arguments(p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'void_sale' loop execute 'drop function public.void_sale(' || args || ')'; end loop; end $drop_void_sale$;
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
  v_destination text;
begin
  select shop_id, payment_method, total, sale_ref, created_at
    into v_shop_id, v_payment, v_total, v_sale_ref, v_ts
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

  -- Void the matching cash register entry (don't delete — audit trail)
  update public.cash_register
    set voided_at   = now(),
        voided_by   = p_actor_id,
        void_reason = p_reason
  where sale_id = p_sale_id
    and source  = 'sale'
    and voided_at is null;

  -- Write a 'void' entry (negative amount) to show the reversal on
  -- the running balance. Same destination, same effective_at so the
  -- void lands on the same day as the original sale in reports.
  v_destination := public.cash_register_destination_for_method(v_payment);
  insert into public.cash_register (
    shop_id, destination, amount, entry_type, source,
    sale_id, notes, created_by, effective_at
  ) values (
    v_shop_id, v_destination, -v_total, 'void', 'void',
    p_sale_id,
    'Void of sale ' || v_sale_ref || coalesce(': ' || p_reason, ''),
    p_actor_id, v_ts
  );
end;
$$;

grant execute on function public.void_sale(uuid, uuid, text) to authenticated;

-- clear old comments on any signature of public.void_sale
do $clear_cmt$ declare args text; begin
  for args in
    select pg_get_function_identity_arguments(p.oid)
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = split_part('public.void_sale', '.', 1) and p.proname = split_part('public.void_sale', '.', 2)
  loop
    execute 'comment on function public.void_sale(' || args || ') is NULL';
  end loop;
end $clear_cmt$;
-- attach the new comment to the latest signature
comment on function public.void_sale is 'Atomically void a sale: marks sales.voided_at, voids the matching '
  'cash_register entry, and writes a negative void entry to keep the '
  'running balance correct.';

-- ── 5. RLS for cash_register ────────────────────────────────────────────
alter table public.cash_register enable row level security;

drop policy if exists cash_register_select on public.cash_register;
drop policy if exists cash_register_select on public.cash_register; create policy cash_register_select on public.cash_register
  for select using (public.is_shop_member(shop_id));

-- Inserts/updates/deletes go through the SECURITY DEFINER functions
-- (create_sale, void_sale) so we don't need separate RLS policies
-- for those. The API endpoint for manual entries will also use a
-- SECURITY DEFINER RPC (added in the same migration).


-- Mark as applied (idempotent)
do $mark$
begin
  perform public._shelf_mark_migration('0013_cash_register');
end $mark$;

-- -----------------------------------------------------------------------------
-- 0014_cash_register_rpcs.sql
-- -----------------------------------------------------------------------------
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
do $drop_log_register_entry$ declare args text; begin for args in select pg_get_function_identity_arguments(p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'log_register_entry' loop execute 'drop function public.log_register_entry(' || args || ')'; end loop; end $drop_log_register_entry$;
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

-- clear old comments on any signature of public.log_register_entry
do $clear_cmt$ declare args text; begin
  for args in
    select pg_get_function_identity_arguments(p.oid)
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = split_part('public.log_register_entry', '.', 1) and p.proname = split_part('public.log_register_entry', '.', 2)
  loop
    execute 'comment on function public.log_register_entry(' || args || ') is NULL';
  end loop;
end $clear_cmt$;
-- attach the new comment to the latest signature
comment on function public.log_register_entry is 'Add a manual entry to the cash register (expense, injection, or '
  'adjustment). Role checks are done in the API layer; this RPC just '
  'validates shape and writes the row.';

-- ── 2. transfer_register ────────────────────────────────────────────────
-- Moves money from one destination to another. Records as TWO rows
-- sharing a transfer_group_id: a negative row on the source, a
-- positive row on the destination, both with the same effective_at.
-- The amounts cancel out across the shop as a whole (the sum is 0)
-- so transfers don't change the shop's total cash, just the per-
-- destination balance.
do $drop_transfer_register$ declare args text; begin for args in select pg_get_function_identity_arguments(p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'transfer_register' loop execute 'drop function public.transfer_register(' || args || ')'; end loop; end $drop_transfer_register$;
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

-- clear old comments on any signature of public.transfer_register
do $clear_cmt$ declare args text; begin
  for args in
    select pg_get_function_identity_arguments(p.oid)
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = split_part('public.transfer_register', '.', 1) and p.proname = split_part('public.transfer_register', '.', 2)
  loop
    execute 'comment on function public.transfer_register(' || args || ') is NULL';
  end loop;
end $clear_cmt$;
-- attach the new comment to the latest signature
comment on function public.transfer_register is 'Move money between cash-register destinations. Records as a paired '
  'IN/OUT pair with a shared transfer_group_id. Net effect on the '
  'shop total is zero; only the per-destination balance changes.';

-- ── 3. void_register_entry ─────────────────────────────────────────────
-- Soft-void a manual entry. Sale/void entries can't be voided here
-- (use void_sale() for those — it handles the paired register writes).
do $drop_void_register_entry$ declare args text; begin for args in select pg_get_function_identity_arguments(p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'void_register_entry' loop execute 'drop function public.void_register_entry(' || args || ')'; end loop; end $drop_void_register_entry$;
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

-- clear old comments on any signature of public.void_register_entry
do $clear_cmt$ declare args text; begin
  for args in
    select pg_get_function_identity_arguments(p.oid)
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = split_part('public.void_register_entry', '.', 1) and p.proname = split_part('public.void_register_entry', '.', 2)
  loop
    execute 'comment on function public.void_register_entry(' || args || ') is NULL';
  end loop;
end $clear_cmt$;
-- attach the new comment to the latest signature
comment on function public.void_register_entry is 'Soft-void a manual cash-register entry. The row stays in the table '
  'with voided_at set so the audit trail is preserved; balance queries '
  'exclude voided rows.';

-- ── 4. get_register_balance — small read helper used by the API ───────
-- Returns the current balance per destination for a shop, plus the
-- grand total. Excludes voided rows.
do $drop_get_register_balance$ declare args text; begin for args in select pg_get_function_identity_arguments(p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'get_register_balance' loop execute 'drop function public.get_register_balance(' || args || ')'; end loop; end $drop_get_register_balance$;
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

-- clear old comments on any signature of public.get_register_balance
do $clear_cmt$ declare args text; begin
  for args in
    select pg_get_function_identity_arguments(p.oid)
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = split_part('public.get_register_balance', '.', 1) and p.proname = split_part('public.get_register_balance', '.', 2)
  loop
    execute 'comment on function public.get_register_balance(' || args || ') is NULL';
  end loop;
end $clear_cmt$;
-- attach the new comment to the latest signature
comment on function public.get_register_balance is 'Current cash-register balance per destination for a shop, plus '
  'the grand total across all destinations. Excludes voided rows.';


-- Mark as applied (idempotent)
do $mark$
begin
  perform public._shelf_mark_migration('0014_cash_register_rpcs');
end $mark$;

-- -----------------------------------------------------------------------------
-- 0015_credit_sales.sql
-- -----------------------------------------------------------------------------
-- 0015_credit_sales.sql
-- Add "credit" as a real customer-pending-payment workflow (not just a
-- card payment alias). A credit sale is one where the customer owes the
-- shop money:
--
--   * credit_status = 'paid'     — full amount received (e.g. they paid
--                                  half now + promised the rest tomorrow
--                                  and we mark it paid because the rest
--                                  was collected offline). Behaves like a
--                                  normal sale from the register's POV.
--   * credit_status = 'partial'  — some amount received, the rest is a
--                                  receivable. The received amount lands
--                                  in the chosen destination (counter/
--                                  bank); the remainder is a 'credit'
--                                  destination entry in the register.
--   * credit_status = 'pending'  — nothing received. Full amount is a
--                                  'credit' destination receivable.
--
-- Effects at sale creation:
--   * sales.credit_status, credit_amount_paid, credit_due_date are set
--   * cash_register gets:
--       - 'sale' entry for the received amount in the chosen destination
--         (or ZERO pending-status)
--       - 'credit' entry for the remaining amount in destination='credit'
--         (or the WHOLE amount for pending)
--   * customers.outstanding_balance is bumped by the credit portion
--     (decremented when the credit is settled later)
--
-- Settling a credit later (via the record_credit_payment RPC):
--   * Writes a 'credit_payment' entry in the register (negative in
--     destination='credit' to zero out the receivable, positive in
--     the destination where the money landed — counter/bank)
--   * Updates the sale's credit_status to 'paid' (or 'partial' if
--     a partial payment was made)
--   * Decrements customers.outstanding_balance

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
    drop trigger if exists trg_sales_credit_balance_sync on public.sales; create trigger trg_sales_credit_balance_sync
  after insert or update or delete on public.sales
  for each row execute function public.sales_credit_balance_sync();

-- ── 5. Update create_sale() to handle credit ────────────────────────────
-- The new params: p_credit_status, p_credit_amount_paid, p_credit_due_date.
-- For non-credit payment methods, p_credit_status is forced to 'paid'.
-- For credit method: API passes the user-chosen status. The function
-- then writes the appropriate entries to cash_register and updates
-- the customer balance via the trigger.
do $drop_create_sale$ declare args text; begin for args in select pg_get_function_identity_arguments(p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'create_sale' loop execute 'drop function public.create_sale(' || args || ')'; end loop; end $drop_create_sale$;

do $drop_create_sale$ declare args text; begin for args in select pg_get_function_identity_arguments(p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'create_sale' loop execute 'drop function public.create_sale(' || args || ')'; end loop; end $drop_create_sale$;


do $drop_create_sale$ declare args text; begin for args in select pg_get_function_identity_arguments(p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'create_sale' loop execute 'drop function public.create_sale(' || args || ')'; end loop; end $drop_create_sale$;
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
  v_credit_destination text := 'credit';  -- the dedicated receivable destination
  v_received_amount numeric := 0;
  v_pending_amount  numeric := 0;
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
    v_pending_amount := 0;
  else
    -- Validate credit inputs
    if p_credit_status not in ('paid','partial','pending') then
      raise exception 'invalid credit_status' using errcode = '22023';
    end if;
    v_effective_credit_status := p_credit_status;
    if p_credit_status = 'paid' then
      v_received_amount := p_total;
      v_pending_amount := 0;
    elsif p_credit_status = 'partial' then
      if p_credit_amount_paid < 0 or p_credit_amount_paid >= p_total then
        raise exception 'partial credit_amount_paid must be > 0 and < total' using errcode = '22023';
      end if;
      v_received_amount := p_credit_amount_paid;
      v_pending_amount := p_total - p_credit_amount_paid;
    else  -- 'pending'
      v_received_amount := 0;
      v_pending_amount := p_total;
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

  -- Cash register entry for the PENDING amount (if any) in the
  -- 'credit' destination. This is a receivable — not real money in
  -- the till, but tracked here so the cash register's "credit
  -- destination" total = total outstanding receivables.
  if v_pending_amount > 0 then
    insert into public.cash_register (
      shop_id, destination, amount, entry_type, source,
      sale_id, notes, created_by, effective_at
    ) values (
      p_shop_id, v_credit_destination, v_pending_amount, 'sale', 'sale',
      v_sale.id,
      'Auto: credit receivable from sale ' || v_ref,
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
do $drop_record_credit_payment$ declare args text; begin for args in select pg_get_function_identity_arguments(p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'record_credit_payment' loop execute 'drop function public.record_credit_payment(' || args || ')'; end loop; end $drop_record_credit_payment$;
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
  if v_destination not in ('counter','bank','other','credit') then
    raise exception 'invalid destination';
  end if;

  -- 1. Write the 'credit_payment' cash-register entry: negative in the
  --    credit destination (reduces the receivable) and positive in the
  --    real destination where the money landed.
  insert into public.cash_register (
    shop_id, destination, amount, entry_type, source,
    sale_id, notes, created_by, effective_at
  ) values (
    v_sale.shop_id, 'credit', -p_amount, 'sale', 'sale',
    p_sale_id,
    'Credit payment received for sale ' || v_sale.sale_ref || coalesce(': ' || p_notes, ''),
    p_actor_id, v_ts
  );
  insert into public.cash_register (
    shop_id, destination, amount, entry_type, source,
    sale_id, notes, created_by, effective_at
  ) values (
    v_sale.shop_id, v_destination, p_amount, 'sale', 'sale',
    p_sale_id,
    'Credit payment from sale ' || v_sale.sale_ref || coalesce(': ' || p_notes, ''),
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

-- clear old comments on any signature of public.record_credit_payment
do $clear_cmt$ declare args text; begin
  for args in
    select pg_get_function_identity_arguments(p.oid)
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = split_part('public.record_credit_payment', '.', 1) and p.proname = split_part('public.record_credit_payment', '.', 2)
  loop
    execute 'comment on function public.record_credit_payment(' || args || ') is NULL';
  end loop;
end $clear_cmt$;
-- attach the new comment to the latest signature
comment on function public.record_credit_payment is 'Settle some or all of a credit sale. Moves the amount from the '
  'credit (receivable) destination to the chosen real destination. '
  'Updates credit_status (partial → paid) and customer totals.';

-- ── 7. Update void_sale() to handle credit reversals ────────────────────
-- When a credit sale is voided, the cash_register entries (sale +
-- credit receivable) get the existing void treatment. But we also
-- need to make sure the customer's outstanding_balance goes back to
-- zero (the trigger handles this since voided_at changes).
-- The existing void_sale() in 0013 already voids the matched 'sale'
-- register entry and writes a negative 'void' entry. For credit sales
-- there are TWO matched entries (one in the chosen destination for the
-- received amount, one in 'credit' for the pending amount). Update
-- void_sale to also void the credit entry and write the appropriate
-- reversal pair.
do $drop_void_sale$ declare args text; begin for args in select pg_get_function_identity_arguments(p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'void_sale' loop execute 'drop function public.void_sale(' || args || ')'; end loop; end $drop_void_sale$;
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

-- clear old comments on any signature of public.void_sale
do $clear_cmt$ declare args text; begin
  for args in
    select pg_get_function_identity_arguments(p.oid)
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = split_part('public.void_sale', '.', 1) and p.proname = split_part('public.void_sale', '.', 2)
  loop
    execute 'comment on function public.void_sale(' || args || ') is NULL';
  end loop;
end $clear_cmt$;
-- attach the new comment to the latest signature
comment on function public.void_sale is 'Atomically void a sale: marks sales.voided_at, voids all linked '
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


-- Mark as applied (idempotent)



-- =============================================================================
-- FINAL: RE-ASSERT GRANTS + REFRESH POSTGREST
-- =============================================================================

do $grants$
begin
  if exists (select 1 from pg_proc where proname = 'is_shop_member') then
    grant execute on function public.is_shop_member(uuid) to authenticated;
  end if;
  if exists (select 1 from pg_proc where proname = 'is_shop_owner') then
    grant execute on function public.is_shop_owner(uuid)  to authenticated;
  end if;
  if exists (select 1 from pg_proc where proname = 'is_shop_invitee') then
    grant execute on function public.is_shop_invitee(uuid) to authenticated;
  end if;
  if exists (select 1 from pg_proc where proname = 'find_user_id_by_email') then
    grant execute on function public.find_user_id_by_email(text) to service_role;
  end if;
  if exists (select 1 from pg_proc where proname = 'get_user_emails') then
    grant execute on function public.get_user_emails(uuid[]) to service_role;
  end if;
  if exists (select 1 from pg_proc where proname = 'set_sale_timestamp') then
    grant execute on function public.set_sale_timestamp(uuid, timestamptz) to authenticated;
  end if;
  if exists (select 1 from pg_proc where proname = 'log_register_entry') then
    grant execute on function public.log_register_entry(uuid, text, numeric, text, text, uuid, timestamptz, uuid) to authenticated;
  end if;
  if exists (select 1 from pg_proc where proname = 'transfer_register') then
    grant execute on function public.transfer_register(uuid, text, text, numeric, text, uuid, timestamptz) to authenticated;
  end if;
  if exists (select 1 from pg_proc where proname = 'void_register_entry') then
    grant execute on function public.void_register_entry(uuid, uuid, text) to authenticated;
  end if;
  if exists (select 1 from pg_proc where proname = 'void_sale') then
    grant execute on function public.void_sale(uuid, uuid, text) to authenticated;
  end if;
  if exists (select 1 from pg_proc where proname = 'get_register_balance') then
    grant execute on function public.get_register_balance(uuid) to authenticated;
  end if;
  if exists (select 1 from pg_proc where proname = 'record_credit_payment') then
    grant execute on function public.record_credit_payment(uuid, numeric, text, uuid, text, timestamptz) to authenticated;
  end if;
end $grants$;

-- Refresh PostgREST schema cache
notify pgrst, 'reload schema';

-- =============================================================================
-- VERIFICATION REPORT
-- =============================================================================
do $verify$
declare
  v_applied integer;
  v_track_stock_exists boolean;
  v_track_barcode_exists boolean;
  v_invited_by_exists boolean;
  v_rpcs integer;
begin
  select count(*) into v_applied from public._shelf_migrations;

  select exists(select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'products'
                  and column_name = 'track_stock')
    into v_track_stock_exists;

  select exists(select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'products'
                  and column_name = 'track_barcode')
    into v_track_barcode_exists;

  select exists(select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'shop_members'
                  and column_name = 'invited_by')
    into v_invited_by_exists;

  select count(*) into v_rpcs
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in (
       'create_sale','receive_purchase_order','is_shop_invitee',
       'find_user_id_by_email','get_user_emails','set_sale_timestamp',
       'log_register_entry','transfer_register','void_register_entry',
       'void_sale','get_register_balance','cash_register_destination_for_method',
       'record_credit_payment'
     );

  raise notice '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
  raise notice 'Shëlf update complete.';
  raise notice '  Migrations applied:    %', v_applied;
  raise notice '  products.track_stock:  %', v_track_stock_exists;
  raise notice '  products.track_barcode:%', v_track_barcode_exists;
  raise notice '  shop_members.invited_by:%', v_invited_by_exists;
  raise notice '  Feature RPCs:          % / 13 expected', v_rpcs;
  raise notice '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
end $verify$;
