-- POS System Database Schema
-- Run this in your Supabase SQL Editor

create extension if not exists "pgcrypto";

-- Products Table
create table products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sku text,
  barcode text,
  category text,
  cost_price numeric(10,2) not null default 0,
  sell_price numeric(10,2) not null default 0,
  current_stock integer not null default 0,
  low_stock_threshold integer not null default 5,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Customers Table
create table customers (
  id uuid primary key default gen_random_uuid(),
  name text,
  phone text,
  credit_balance numeric(10,2) not null default 0,
  created_at timestamptz not null default now()
);

-- Sales Table
create table sales (
  id uuid primary key default gen_random_uuid(),
  subtotal numeric(10,2) not null default 0,
  tax_amount numeric(10,2) not null default 0,
  discount_amount numeric(10,2) not null default 0,
  total_amount numeric(10,2) not null default 0,
  payment_method text check (payment_method in ('cash','card','upi','wallet')),
  customer_id uuid references customers(id),
  created_at timestamptz not null default now()
);

-- Sale Line Items Table
create table sale_line_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references sales(id) on delete cascade,
  product_id uuid not null references products(id),
  quantity integer not null check (quantity > 0),
  unit_price numeric(10,2) not null,
  discount_amount numeric(10,2) not null default 0,
  line_total numeric(10,2) not null
);

-- Stock Movements Table
create table stock_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id),
  change_qty integer not null,
  reason text check (reason in ('sale','restock','correction','damage_loss','return')),
  note text,
  created_at timestamptz not null default now()
);

-- Settings Table
create table settings (
  id uuid primary key default gen_random_uuid(),
  business_name text not null default 'My Shop',
  currency text not null default 'INR',
  tax_rate numeric(5,2) not null default 0,
  default_low_stock_threshold integer not null default 5
);

-- Insert default settings row
insert into settings (business_name, currency, tax_rate, default_low_stock_threshold)
values ('My Shop', 'INR', 0, 5);

-- Enable Row Level Security
alter table products enable row level security;
alter table customers enable row level security;
alter table sales enable row level security;
alter table sale_line_items enable row level security;
alter table stock_movements enable row level security;
alter table settings enable row level security;

-- RLS Policies: Owner full access (any authenticated user)
create policy "Owner full access" on products
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

create policy "Owner full access" on customers
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

create policy "Owner full access" on sales
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

create policy "Owner full access" on sale_line_items
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

create policy "Owner full access" on stock_movements
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

create policy "Owner full access" on settings
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

-- Function to update product stock when stock_movements are inserted
create or replace function update_product_stock()
returns trigger as $$
begin
  update products
  set current_stock = current_stock + new.change_qty,
      updated_at = now()
  where id = new.product_id;
  return new;
end;
$$ language plpgsql security definer;

-- Trigger to automatically update stock on movement
create trigger on_stock_movement
  after insert on stock_movements
  for each row
  execute function update_product_stock();

-- Function to update updated_at timestamp
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Trigger for products table
create trigger update_products_updated_at
  before update on products
  for each row
  execute function update_updated_at_column();
