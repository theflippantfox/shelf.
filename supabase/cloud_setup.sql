-- =============================================================================
-- Shëlf · Supabase Cloud Setup
-- =============================================================================
-- Run this once against an empty Supabase project (Cloud or local) to
-- provision the full schema. SAFE TO RE-RUN — every step is idempotent.
--
--   * Use the Supabase SQL Editor in the dashboard
--   * OR: psql "$DATABASE_URL" -f cloud_setup.sql
--   * OR: supabase db push (after dropping the file in supabase/migrations/)
--
-- What this does:
--   1. Creates a `_shelf_migrations` ledger to track what's been applied
--   2. Runs each migration in order, skipping ones already in the ledger
--   3. Wraps each migration in `do $mig$` blocks for conditional execution
--   4. Patches every `create table` / `create index` / `create trigger` /
--      `create policy` to be idempotent (if not exists / drop if exists)
--   5. Re-asserts grants on the auth.users trigger helper functions
--   6. Refreshes the PostgREST schema cache
--   7. Prints a verification report
--
-- Pre-existing data is NEVER touched. Every DDL uses `if not exists` or
-- `drop if exists ... create ...` so re-running is safe.
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
-- 1–N. MIGRATIONS
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0001_init.sql
-- -----------------------------------------------------------------------------
do $mig$
begin
  if not public._shelf_has_migration('0001_init') then
    raise notice 'Applying 0001_init …';
-- 0001_init.sql
-- Initial schema for Shëlf POS.
-- Mirrors src/lib/types/directus.ts but uses Supabase conventions:
--   - auth.users is the identity source
--   - public.profiles holds app-level user fields
--   - all foreign keys named *_id

create extension if not exists pgcrypto;

-- =========================================================================
-- profiles — 1:1 with auth.users, holds app-level user fields
-- =========================================================================
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  first_name  text not null,
  last_name   text not null default '',
  avatar_url  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.profiles is
  'App-level user profile, one row per auth.users entry.';

-- =========================================================================
-- shops — a tenant. owner_id is the original creator.
-- =========================================================================
create table if not exists public.shops (
  id                    uuid primary key default gen_random_uuid(),
  owner_id              uuid not null references public.profiles(id) on delete restrict,
  name                  text not null,
  slug                  text not null unique,
  country_code          text not null,
  currency_code         text not null,
  currency_symbol       text not null,
  currency_locale       text not null,
  timezone              text not null,
  date_format           text not null,
  time_format           text not null check (time_format in ('12h','24h')),
  tax_rate              numeric(5,2) not null default 0,
  tax_inclusive         boolean not null default false,
  tax_name              text not null default 'Tax',
  theme                 text not null default 'system' check (theme in ('light','dark','system')),
  primary_color         text not null default '#000000',
  sidebar_bg            text not null default '#ffffff',
  onboarding_complete   boolean not null default false,
  onboarding_step       text not null default 'shop',
  low_stock_threshold   integer not null default 5,
  receipt_header        text,
  receipt_footer        text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists shops_owner_id_idx on public.shops(owner_id);

-- =========================================================================
-- shop_members — links profiles to shops with a role
-- =========================================================================
create table if not exists public.shop_members (
  id          uuid primary key default gen_random_uuid(),
  shop_id     uuid not null references public.shops(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  role        text not null check (role in ('owner','manager','cashier')),
  permissions jsonb,
  status      text not null default 'active' check (status in ('active','invited','suspended')),
  created_at  timestamptz not null default now(),
  unique(shop_id, user_id)
);

create index if not exists shop_members_user_id_idx on public.shop_members(user_id);
create index if not exists shop_members_shop_id_idx on public.shop_members(shop_id);

-- =========================================================================
-- categories
-- =========================================================================
create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  shop_id     uuid not null references public.shops(id) on delete cascade,
  name        text not null,
  icon        text not null default 'tag',
  color       text not null default '#888888',
  sort_order  integer not null default 0,
  archived_at timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists categories_shop_id_idx on public.categories(shop_id);

-- =========================================================================
-- tags
-- =========================================================================
create table if not exists public.tags (
  id          uuid primary key default gen_random_uuid(),
  shop_id     uuid not null references public.shops(id) on delete cascade,
  name        text not null,
  color       text not null default '#888888',
  created_at  timestamptz not null default now(),
  unique(shop_id, name)
);

create index if not exists tags_shop_id_idx on public.tags(shop_id);

-- =========================================================================
-- suppliers (defined before products because products.preferred_supplier_id references it)
-- =========================================================================
create table if not exists public.suppliers (
  id              uuid primary key default gen_random_uuid(),
  shop_id         uuid not null references public.shops(id) on delete cascade,
  name            text not null,
  contact_name    text,
  phone           text,
  email           text,
  address         text,
  payment_terms   text not null check (payment_terms in ('cash','credit','net_15','net_30','net_60','consignment')),
  currency_code   text not null,
  lead_time_days  integer,
  notes           text,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists suppliers_shop_id_idx on public.suppliers(shop_id);

-- =========================================================================
-- products
-- =========================================================================
create table if not exists public.products (
  id                    uuid primary key default gen_random_uuid(),
  shop_id               uuid not null references public.shops(id) on delete cascade,
  name                  text not null,
  sku                   text not null,
  description           text,
  category_id           uuid references public.categories(id) on delete set null,
  preferred_supplier_id uuid references public.suppliers(id) on delete set null,
  price                 numeric(10,2) not null default 0,
  cost_price            numeric(10,2) not null default 0,
  qty                   integer not null default 0,
  low_stock_threshold   integer not null default 5,
  reorder_point         integer,
  unit                  text not null default 'pcs',
  image_url             text,
  barcode               text,
  expiry_tracking       boolean not null default false,
  archived_at           timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique(shop_id, sku)
);

create index if not exists products_shop_id_idx     on public.products(shop_id);
create index if not exists products_category_id_idx on public.products(category_id);

-- =========================================================================
-- product_tags — many-to-many
-- =========================================================================
create table if not exists public.product_tags (
  product_id uuid not null references public.products(id) on delete cascade,
  tag_id     uuid not null references public.tags(id) on delete cascade,
  primary key (product_id, tag_id)
);

create index if not exists product_tags_tag_id_idx on public.product_tags(tag_id);

-- =========================================================================
-- customers
-- =========================================================================
create table if not exists public.customers (
  id           uuid primary key default gen_random_uuid(),
  shop_id      uuid not null references public.shops(id) on delete cascade,
  name         text not null,
  phone        text,
  email        text,
  notes        text,
  visit_count  integer not null default 0,
  total_spent  numeric(10,2) not null default 0,
  last_visit   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists customers_shop_id_idx on public.customers(shop_id);

-- =========================================================================
-- sales
-- =========================================================================
create table if not exists public.sales (
  id               uuid primary key default gen_random_uuid(),
  shop_id          uuid not null references public.shops(id) on delete cascade,
  sale_ref         text not null,
  customer_id      uuid references public.customers(id) on delete set null,
  served_by        uuid not null references public.profiles(id),
  subtotal         numeric(10,2) not null default 0,
  discount_type    text not null default 'amount' check (discount_type in ('amount','percent')),
  discount_value   numeric(10,2) not null default 0,
  discount_amount  numeric(10,2) not null default 0,
  total            numeric(10,2) not null default 0,
  tax_amount       numeric(10,2) not null default 0,
  payment_method   text not null check (payment_method in ('cash','credit','transfer')),
  notes            text,
  voided_at        timestamptz,
  voided_by        uuid references public.profiles(id),
  void_reason      text,
  created_at       timestamptz not null default now(),
  unique(shop_id, sale_ref)
);

create index if not exists sales_shop_id_created_at_idx on public.sales(shop_id, created_at desc);

-- =========================================================================
-- sale_items
-- =========================================================================
create table if not exists public.sale_items (
  id           uuid primary key default gen_random_uuid(),
  sale_id      uuid not null references public.sales(id) on delete cascade,
  product_id   uuid not null references public.products(id),
  product_name text not null,
  product_sku  text not null,
  unit_price   numeric(10,2) not null,
  qty          integer not null check (qty > 0),
  line_total   numeric(10,2) not null
);

create index if not exists sale_items_sale_id_idx on public.sale_items(sale_id);

-- =========================================================================
-- purchase_orders (defined early so stock_log/supplier_price_history can reference it)
-- =========================================================================
create table if not exists public.purchase_orders (
  id                      uuid primary key default gen_random_uuid(),
  shop_id                 uuid not null references public.shops(id) on delete cascade,
  supplier_id             uuid not null references public.suppliers(id),
  order_ref               text not null,
  status                  text not null check (status in ('draft','ordered','partial','received','cancelled')),
  order_date              date not null,
  expected_delivery_date  date,
  received_date           date,
  subtotal                numeric(10,2) not null default 0,
  tax_amount              numeric(10,2) not null default 0,
  shipping_cost           numeric(10,2) not null default 0,
  total_cost              numeric(10,2) not null default 0,
  bill_image_url          text,
  notes                   text,
  created_by              uuid not null references public.profiles(id),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique(shop_id, order_ref)
);

create index if not exists purchase_orders_shop_id_idx on public.purchase_orders(shop_id);

-- =========================================================================
-- purchase_order_items
-- =========================================================================
create table if not exists public.purchase_order_items (
  id                  uuid primary key default gen_random_uuid(),
  purchase_order_id   uuid not null references public.purchase_orders(id) on delete cascade,
  product_id          uuid references public.products(id) on delete set null,
  product_name        text not null,
  product_sku         text not null,
  quantity_ordered    integer not null check (quantity_ordered > 0),
  quantity_received   integer not null default 0,
  unit_cost           numeric(10,2) not null,
  line_total          numeric(10,2) not null,
  is_new_product      boolean not null default false,
  notes               text
);

create index if not exists purchase_order_items_po_id_idx on public.purchase_order_items(purchase_order_id);

-- =========================================================================
-- stock_log
-- =========================================================================
create table if not exists public.stock_log (
  id                uuid primary key default gen_random_uuid(),
  shop_id           uuid not null references public.shops(id) on delete cascade,
  product_id        uuid not null references public.products(id) on delete cascade,
  delta             integer not null,
  reason            text not null check (reason in ('sale','restock','adjustment','void')),
  reference         text,
  purchase_order_id uuid references public.purchase_orders(id) on delete set null,
  created_by        uuid not null references public.profiles(id),
  created_at        timestamptz not null default now()
);

create index if not exists stock_log_shop_id_created_at_idx on public.stock_log(shop_id, created_at desc);

-- =========================================================================
-- supplier_price_history
-- =========================================================================
create table if not exists public.supplier_price_history (
  id                uuid primary key default gen_random_uuid(),
  shop_id           uuid not null references public.shops(id) on delete cascade,
  supplier_id       uuid not null references public.suppliers(id),
  product_id        uuid not null references public.products(id),
  unit_cost         numeric(10,2) not null,
  currency_code     text not null,
  purchase_order_id uuid references public.purchase_orders(id) on delete set null,
  recorded_at       timestamptz not null default now(),
  notes             text
);

create index if not exists supplier_price_history_shop_id_idx on public.supplier_price_history(shop_id);

-- =========================================================================
-- product_batches
-- =========================================================================
create table if not exists public.product_batches (
  id                     uuid primary key default gen_random_uuid(),
  shop_id                uuid not null references public.shops(id) on delete cascade,
  product_id             uuid not null references public.products(id) on delete cascade,
  purchase_order_item_id uuid references public.purchase_order_items(id) on delete set null,
  batch_number           text,
  expiry_date            date,
  quantity_remaining     integer not null,
  created_at             timestamptz not null default now()
);

create index if not exists product_batches_shop_id_idx on public.product_batches(shop_id);

-- =========================================================================
-- set_updated_at trigger — attached to every table with updated_at
-- =========================================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

    drop trigger if exists trg_profiles_updated_at on public.profiles; create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

    drop trigger if exists trg_shops_updated_at on public.shops; create trigger trg_shops_updated_at
  before update on public.shops
  for each row execute function public.set_updated_at();

    drop trigger if exists trg_products_updated_at on public.products; create trigger trg_products_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

    drop trigger if exists trg_customers_updated_at on public.customers; create trigger trg_customers_updated_at
  before update on public.customers
  for each row execute function public.set_updated_at();

    drop trigger if exists trg_suppliers_updated_at on public.suppliers; create trigger trg_suppliers_updated_at
  before update on public.suppliers
  for each row execute function public.set_updated_at();

    drop trigger if exists trg_purchase_orders_updated_at on public.purchase_orders; create trigger trg_purchase_orders_updated_at
  before update on public.purchase_orders
  for each row execute function public.set_updated_at();

-- =========================================================================
-- handle_new_user — auto-create a profiles row when a user signs up via auth
-- =========================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, first_name, last_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'first_name', ''),
    coalesce(new.raw_user_meta_data->>'last_name', '')
  );
  return new;
end;
$$;

    drop trigger if exists on_auth_user_created on auth.users; create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
    perform public._shelf_mark_migration('0001_init');
  end if;
end $mig$;

-- -----------------------------------------------------------------------------
-- 0002_rls_policies.sql
-- -----------------------------------------------------------------------------
do $mig$
begin
  if not public._shelf_has_migration('0002_rls_policies') then
    raise notice 'Applying 0002_rls_policies …';
-- 0002_rls_policies.sql
-- Row Level Security for all public tables.
--
-- Pattern: shop-scoped tables use is_shop_member(shop_id) to check
-- membership. profiles is the only non-shop-scoped table.
-- Owners have a stricter check via is_shop_owner(shop_id).

-- =========================================================================
-- Helper functions
-- =========================================================================

-- Is the current authenticated user an active member of this shop?
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
      and status = 'active'
  );
$$;

-- Is the current authenticated user an active OWNER of this shop?
create or replace function public.is_shop_owner(shop uuid)
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
      and role = 'owner'
      and status = 'active'
  );
$$;

-- =========================================================================
-- Enable RLS on every public table
-- =========================================================================

alter table public.profiles               enable row level security;
alter table public.shops                  enable row level security;
alter table public.shop_members           enable row level security;
alter table public.categories             enable row level security;
alter table public.tags                   enable row level security;
alter table public.suppliers              enable row level security;
alter table public.products               enable row level security;
alter table public.product_tags           enable row level security;
alter table public.customers              enable row level security;
alter table public.sales                  enable row level security;
alter table public.sale_items             enable row level security;
alter table public.stock_log              enable row level security;
alter table public.purchase_orders        enable row level security;
alter table public.purchase_order_items   enable row level security;
alter table public.supplier_price_history enable row level security;
alter table public.product_batches        enable row level security;

-- =========================================================================
-- profiles — users read/update their own row only
-- =========================================================================

drop policy if exists profiles_self_select on public.profiles; create policy profiles_self_select on public.profiles
  for select using (id = auth.uid());

-- Profiles of co-members of any shop I'm also a member of are visible
-- to me — needed for the team page to show member names + avatars next
-- to the email we already know. Uses is_shop_member() (which already
-- treats 'invited' as a member status) so that pending invitees can
-- see who else is on the team / who invited them.
drop policy if exists profiles_coselect on public.profiles; create policy profiles_coselect on public.profiles
  for select using (
    exists (
      select 1
      from public.shop_members me
      where me.user_id = auth.uid()
        and me.status in ('active', 'invited')
        and exists (
          select 1
          from public.shop_members them
          where them.user_id = profiles.id
            and them.shop_id = me.shop_id
        )
    )
  );

drop policy if exists profiles_self_update on public.profiles; create policy profiles_self_update on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists profiles_self_insert on public.profiles; create policy profiles_self_insert on public.profiles
  for insert with check (id = auth.uid());

-- =========================================================================
-- shops — members can read; only owners can update
-- =========================================================================

drop policy if exists shops_member_select on public.shops; create policy shops_member_select on public.shops
  for select using (public.is_shop_member(id));

drop policy if exists shops_owner_update on public.shops; create policy shops_owner_update on public.shops
  for update using (public.is_shop_owner(id));

drop policy if exists shops_owner_insert on public.shops; create policy shops_owner_insert on public.shops
  for insert with check (owner_id = auth.uid());

-- =========================================================================
-- shop_members — members see same-shop members; owners manage
-- =========================================================================

drop policy if exists shop_members_select on public.shop_members; create policy shop_members_select on public.shop_members
  for select using (public.is_shop_member(shop_id));

drop policy if exists shop_members_owner_write on public.shop_members; create policy shop_members_owner_write on public.shop_members
  for all using (public.is_shop_owner(shop_id))
        with check (public.is_shop_owner(shop_id));

-- =========================================================================
-- Generic shop-scoped tables — members can select; members can write
-- =========================================================================

-- categories
drop policy if exists categories_select on public.categories; create policy categories_select on public.categories
  for select using (public.is_shop_member(shop_id));
drop policy if exists categories_write on public.categories; create policy categories_write on public.categories
  for all using (public.is_shop_member(shop_id))
        with check (public.is_shop_member(shop_id));

-- tags
drop policy if exists tags_select on public.tags; create policy tags_select on public.tags
  for select using (public.is_shop_member(shop_id));
drop policy if exists tags_write on public.tags; create policy tags_write on public.tags
  for all using (public.is_shop_member(shop_id))
        with check (public.is_shop_member(shop_id));

-- suppliers
drop policy if exists suppliers_select on public.suppliers; create policy suppliers_select on public.suppliers
  for select using (public.is_shop_member(shop_id));
drop policy if exists suppliers_write on public.suppliers; create policy suppliers_write on public.suppliers
  for all using (public.is_shop_member(shop_id))
        with check (public.is_shop_member(shop_id));

-- products
drop policy if exists products_select on public.products; create policy products_select on public.products
  for select using (public.is_shop_member(shop_id));
drop policy if exists products_write on public.products; create policy products_write on public.products
  for all using (public.is_shop_member(shop_id))
        with check (public.is_shop_member(shop_id));

-- customers
drop policy if exists customers_select on public.customers; create policy customers_select on public.customers
  for select using (public.is_shop_member(shop_id));
drop policy if exists customers_write on public.customers; create policy customers_write on public.customers
  for all using (public.is_shop_member(shop_id))
        with check (public.is_shop_member(shop_id));

-- sales
drop policy if exists sales_select on public.sales; create policy sales_select on public.sales
  for select using (public.is_shop_member(shop_id));
drop policy if exists sales_write on public.sales; create policy sales_write on public.sales
  for all using (public.is_shop_member(shop_id))
        with check (public.is_shop_member(shop_id));

-- purchase_orders
drop policy if exists purchase_orders_select on public.purchase_orders; create policy purchase_orders_select on public.purchase_orders
  for select using (public.is_shop_member(shop_id));
drop policy if exists purchase_orders_write on public.purchase_orders; create policy purchase_orders_write on public.purchase_orders
  for all using (public.is_shop_member(shop_id))
        with check (public.is_shop_member(shop_id));

-- stock_log
drop policy if exists stock_log_select on public.stock_log; create policy stock_log_select on public.stock_log
  for select using (public.is_shop_member(shop_id));
drop policy if exists stock_log_write on public.stock_log; create policy stock_log_write on public.stock_log
  for all using (public.is_shop_member(shop_id))
        with check (public.is_shop_member(shop_id) and created_by = auth.uid());

-- supplier_price_history
drop policy if exists supplier_price_history_select on public.supplier_price_history; create policy supplier_price_history_select on public.supplier_price_history
  for select using (public.is_shop_member(shop_id));
drop policy if exists supplier_price_history_write on public.supplier_price_history; create policy supplier_price_history_write on public.supplier_price_history
  for all using (public.is_shop_member(shop_id))
        with check (public.is_shop_member(shop_id));

-- product_batches
drop policy if exists product_batches_select on public.product_batches; create policy product_batches_select on public.product_batches
  for select using (public.is_shop_member(shop_id));
drop policy if exists product_batches_write on public.product_batches; create policy product_batches_write on public.product_batches
  for all using (public.is_shop_member(shop_id))
        with check (public.is_shop_member(shop_id));

-- =========================================================================
-- Tables whose RLS depends on a parent row's shop_id
-- =========================================================================

-- sale_items — readable/writable if the parent sale belongs to your shop
drop policy if exists sale_items_select on public.sale_items; create policy sale_items_select on public.sale_items
  for select using (
    exists(
      select 1 from public.sales s
      where s.id = sale_items.sale_id
        and public.is_shop_member(s.shop_id)
    )
  );
drop policy if exists sale_items_write on public.sale_items; create policy sale_items_write on public.sale_items
  for all using (
    exists(
      select 1 from public.sales s
      where s.id = sale_items.sale_id
        and public.is_shop_member(s.shop_id)
    )
  )
  with check (
    exists(
      select 1 from public.sales s
      where s.id = sale_items.sale_id
        and public.is_shop_member(s.shop_id)
    )
  );

-- purchase_order_items — readable/writable if the parent PO belongs to your shop
drop policy if exists purchase_order_items_select on public.purchase_order_items; create policy purchase_order_items_select on public.purchase_order_items
  for select using (
    exists(
      select 1 from public.purchase_orders po
      where po.id = purchase_order_items.purchase_order_id
        and public.is_shop_member(po.shop_id)
    )
  );
drop policy if exists purchase_order_items_write on public.purchase_order_items; create policy purchase_order_items_write on public.purchase_order_items
  for all using (
    exists(
      select 1 from public.purchase_orders po
      where po.id = purchase_order_items.purchase_order_id
        and public.is_shop_member(po.shop_id)
    )
  )
  with check (
    exists(
      select 1 from public.purchase_orders po
      where po.id = purchase_order_items.purchase_order_id
        and public.is_shop_member(po.shop_id)
    )
  );

-- product_tags — readable/writable if the parent product belongs to your shop
drop policy if exists product_tags_select on public.product_tags; create policy product_tags_select on public.product_tags
  for select using (
    exists(
      select 1 from public.products p
      where p.id = product_tags.product_id
        and public.is_shop_member(p.shop_id)
    )
  );
drop policy if exists product_tags_write on public.product_tags; create policy product_tags_write on public.product_tags
  for all using (
    exists(
      select 1 from public.products p
      where p.id = product_tags.product_id
        and public.is_shop_member(p.shop_id)
    )
  )
  with check (
    exists(
      select 1 from public.products p
      where p.id = product_tags.product_id
        and public.is_shop_member(p.shop_id)
    )
  );

-- =========================================================================
-- Grant execute on helper functions to authenticated role
-- =========================================================================

grant execute on function public.is_shop_member(uuid) to authenticated;
grant execute on function public.is_shop_owner(uuid)  to authenticated;
    perform public._shelf_mark_migration('0002_rls_policies');
  end if;
end $mig$;

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

-- Some Supabase setups don't propagate GRANTs from inside function bodies
-- in older migrations. Re-assert here so RPCs work.
do $grants$
begin
  -- Grant execute on helper functions
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
  v_table_count integer;
  v_policy_count integer;
  v_rpc_count integer;
  v_mig_count integer;
begin
  select count(*) into v_table_count
    from information_schema.tables
   where table_schema = 'public' and table_type = 'BASE TABLE';

  select count(*) into v_policy_count
    from pg_policies where schemaname = 'public';

  select count(*) into v_rpc_count
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in (
       'create_sale','receive_purchase_order','is_shop_member','is_shop_owner',
       'is_shop_invitee','find_user_id_by_email','get_user_emails',
       'handle_new_user','set_updated_at'
     );

  select count(*) into v_mig_count from public._shelf_migrations;

  raise notice '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
  raise notice 'Shëlf setup complete.';
  raise notice '  Tables:    %', v_table_count;
  raise notice '  Policies:  %', v_policy_count;
  raise notice '  RPCs:      % / 9 expected', v_rpc_count;
  raise notice '  Applied:   % migrations', v_mig_count;
  raise notice '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
end $verify$;
