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
create table public.profiles (
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
create table public.shops (
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

create index shops_owner_id_idx on public.shops(owner_id);

-- =========================================================================
-- shop_members — links profiles to shops with a role
-- =========================================================================
create table public.shop_members (
  id          uuid primary key default gen_random_uuid(),
  shop_id     uuid not null references public.shops(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  role        text not null check (role in ('owner','manager','cashier')),
  permissions jsonb,
  status      text not null default 'active' check (status in ('active','invited','suspended')),
  created_at  timestamptz not null default now(),
  unique(shop_id, user_id)
);

create index shop_members_user_id_idx on public.shop_members(user_id);
create index shop_members_shop_id_idx on public.shop_members(shop_id);

-- =========================================================================
-- categories
-- =========================================================================
create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  shop_id     uuid not null references public.shops(id) on delete cascade,
  name        text not null,
  icon        text not null default 'tag',
  color       text not null default '#888888',
  sort_order  integer not null default 0,
  archived_at timestamptz,
  created_at  timestamptz not null default now()
);

create index categories_shop_id_idx on public.categories(shop_id);

-- =========================================================================
-- tags
-- =========================================================================
create table public.tags (
  id          uuid primary key default gen_random_uuid(),
  shop_id     uuid not null references public.shops(id) on delete cascade,
  name        text not null,
  color       text not null default '#888888',
  created_at  timestamptz not null default now(),
  unique(shop_id, name)
);

create index tags_shop_id_idx on public.tags(shop_id);

-- =========================================================================
-- suppliers (defined before products because products.preferred_supplier_id references it)
-- =========================================================================
create table public.suppliers (
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

create index suppliers_shop_id_idx on public.suppliers(shop_id);

-- =========================================================================
-- products
-- =========================================================================
create table public.products (
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

create index products_shop_id_idx     on public.products(shop_id);
create index products_category_id_idx on public.products(category_id);

-- =========================================================================
-- product_tags — many-to-many
-- =========================================================================
create table public.product_tags (
  product_id uuid not null references public.products(id) on delete cascade,
  tag_id     uuid not null references public.tags(id) on delete cascade,
  primary key (product_id, tag_id)
);

create index product_tags_tag_id_idx on public.product_tags(tag_id);

-- =========================================================================
-- customers
-- =========================================================================
create table public.customers (
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

create index customers_shop_id_idx on public.customers(shop_id);

-- =========================================================================
-- sales
-- =========================================================================
create table public.sales (
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

create index sales_shop_id_created_at_idx on public.sales(shop_id, created_at desc);

-- =========================================================================
-- sale_items
-- =========================================================================
create table public.sale_items (
  id           uuid primary key default gen_random_uuid(),
  sale_id      uuid not null references public.sales(id) on delete cascade,
  product_id   uuid not null references public.products(id),
  product_name text not null,
  product_sku  text not null,
  unit_price   numeric(10,2) not null,
  qty          integer not null check (qty > 0),
  line_total   numeric(10,2) not null
);

create index sale_items_sale_id_idx on public.sale_items(sale_id);

-- =========================================================================
-- purchase_orders (defined early so stock_log/supplier_price_history can reference it)
-- =========================================================================
create table public.purchase_orders (
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

create index purchase_orders_shop_id_idx on public.purchase_orders(shop_id);

-- =========================================================================
-- purchase_order_items
-- =========================================================================
create table public.purchase_order_items (
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

create index purchase_order_items_po_id_idx on public.purchase_order_items(purchase_order_id);

-- =========================================================================
-- stock_log
-- =========================================================================
create table public.stock_log (
  id                uuid primary key default gen_random_uuid(),
  shop_id           uuid not null references public.shops(id) on delete cascade,
  product_id        uuid not null references public.products(id) on delete cascade,
  delta             integer not null,
  reason            text not null check (reason in ('sale','restock','adjustment','void','return','damage','expiry')),
  reference         text,
  purchase_order_id uuid references public.purchase_orders(id) on delete set null,
  created_by        uuid not null references public.profiles(id),
  created_at        timestamptz not null default now()
);

create index stock_log_shop_id_created_at_idx on public.stock_log(shop_id, created_at desc);

-- =========================================================================
-- supplier_price_history
-- =========================================================================
create table public.supplier_price_history (
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

create index supplier_price_history_shop_id_idx on public.supplier_price_history(shop_id);

-- =========================================================================
-- product_batches
-- =========================================================================
create table public.product_batches (
  id                     uuid primary key default gen_random_uuid(),
  shop_id                uuid not null references public.shops(id) on delete cascade,
  product_id             uuid not null references public.products(id) on delete cascade,
  purchase_order_item_id uuid references public.purchase_order_items(id) on delete set null,
  batch_number           text,
  expiry_date            date,
  quantity_remaining     integer not null,
  created_at             timestamptz not null default now()
);

create index product_batches_shop_id_idx on public.product_batches(shop_id);

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

create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger trg_shops_updated_at
  before update on public.shops
  for each row execute function public.set_updated_at();

create trigger trg_products_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

create trigger trg_customers_updated_at
  before update on public.customers
  for each row execute function public.set_updated_at();

create trigger trg_suppliers_updated_at
  before update on public.suppliers
  for each row execute function public.set_updated_at();

create trigger trg_purchase_orders_updated_at
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

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();