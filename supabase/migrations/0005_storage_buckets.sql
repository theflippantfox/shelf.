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