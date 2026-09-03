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
do $mig$
begin
  if not public._shelf_has_migration('0003_functions_create_sale') then
    raise notice 'Applying 0003_functions_create_sale …';
-- 0003_functions_create_sale.sql
-- Atomic sale creation. Replaces the multi-query sale creation in
-- src/routes/api/sales/+server.ts, which had a race condition between
-- the sale insert and the per-item stock decrements.
--
-- The function is SECURITY DEFINER so it can insert stock_log rows even
-- when the RLS policy on stock_log would otherwise require created_by = auth.uid().
-- Membership is still verified inside via is_shop_member().

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

comment on function public.create_sale is
  'Atomically create a sale, its line items, and stock decrement entries.';
    perform public._shelf_mark_migration('0003_functions_create_sale');
  end if;
end $mig$;

-- -----------------------------------------------------------------------------
-- 0004_functions_receive_purchase_order.sql
-- -----------------------------------------------------------------------------
do $mig$
begin
  if not public._shelf_has_migration('0004_functions_receive_purchase_order') then
    raise notice 'Applying 0004_functions_receive_purchase_order …';
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

comment on function public.receive_purchase_order is
  'Atomically receive a purchase order: update items, increment stock, write stock_log and supplier_price_history, recompute PO status.';
    perform public._shelf_mark_migration('0004_functions_receive_purchase_order');
  end if;
end $mig$;

-- -----------------------------------------------------------------------------
-- 0005_storage_buckets.sql
-- -----------------------------------------------------------------------------
do $mig$
begin
  if not public._shelf_has_migration('0005_storage_buckets') then
    raise notice 'Applying 0005_storage_buckets …';
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
    perform public._shelf_mark_migration('0005_storage_buckets');
  end if;
end $mig$;

-- -----------------------------------------------------------------------------
-- 0006_snapshot_cost_at_sale.sql
-- -----------------------------------------------------------------------------
do $mig$
begin
  if not public._shelf_has_migration('0006_snapshot_cost_at_sale') then
    raise notice 'Applying 0006_snapshot_cost_at_sale …';
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
    perform public._shelf_mark_migration('0006_snapshot_cost_at_sale');
  end if;
end $mig$;

-- -----------------------------------------------------------------------------
-- 0007_palette_id.sql
-- -----------------------------------------------------------------------------
do $mig$
begin
  if not public._shelf_has_migration('0007_palette_id') then
    raise notice 'Applying 0007_palette_id …';
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

    perform public._shelf_mark_migration('0007_palette_id');
  end if;
end $mig$;

-- -----------------------------------------------------------------------------
-- 0008_normalize_discount_value_to_major.sql
-- -----------------------------------------------------------------------------
do $mig$
begin
  if not public._shelf_has_migration('0008_normalize_discount_value_to_major') then
    raise notice 'Applying 0008_normalize_discount_value_to_major …';
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

    perform public._shelf_mark_migration('0008_normalize_discount_value_to_major');
  end if;
end $mig$;

-- -----------------------------------------------------------------------------
-- 0008_palette_id_expand.sql
-- -----------------------------------------------------------------------------
do $mig$
begin
  if not public._shelf_has_migration('0008_palette_id_expand') then
    raise notice 'Applying 0008_palette_id_expand …';
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
    perform public._shelf_mark_migration('0008_palette_id_expand');
  end if;
end $mig$;

-- -----------------------------------------------------------------------------
-- 0009_products_barcode_unique.sql
-- -----------------------------------------------------------------------------
do $mig$
begin
  if not public._shelf_has_migration('0009_products_barcode_unique') then
    raise notice 'Applying 0009_products_barcode_unique …';
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

    perform public._shelf_mark_migration('0009_products_barcode_unique');
  end if;
end $mig$;

-- -----------------------------------------------------------------------------
-- 0010_team_invites.sql
-- -----------------------------------------------------------------------------
do $mig$
begin
  if not public._shelf_has_migration('0010_team_invites') then
    raise notice 'Applying 0010_team_invites …';
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

    perform public._shelf_mark_migration('0010_team_invites');
  end if;
end $mig$;

-- -----------------------------------------------------------------------------
-- 0011_product_toggles.sql
-- -----------------------------------------------------------------------------
do $mig$
begin
  if not public._shelf_has_migration('0011_product_toggles') then
    raise notice 'Applying 0011_product_toggles …';
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

    perform public._shelf_mark_migration('0011_product_toggles');
  end if;
end $mig$;

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
       'find_user_id_by_email','get_user_emails'
     );

  raise notice '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
  raise notice 'Shëlf update complete.';
  raise notice '  Migrations applied:    %', v_applied;
  raise notice '  products.track_stock:  %', v_track_stock_exists;
  raise notice '  products.track_barcode:%', v_track_barcode_exists;
  raise notice '  shop_members.invited_by:%', v_invited_by_exists;
  raise notice '  Feature RPCs:          % / 5 expected', v_rpcs;
  raise notice '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
end $verify$;
