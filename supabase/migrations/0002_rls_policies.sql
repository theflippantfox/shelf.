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

create policy profiles_self_select on public.profiles
  for select using (id = auth.uid());

-- Profiles of co-members of any shop I'm also a member of are visible
-- to me — needed for the team page to show member names + avatars next
-- to the email we already know. Uses is_shop_member() (which already
-- treats 'invited' as a member status) so that pending invitees can
-- see who else is on the team / who invited them.
create policy profiles_coselect on public.profiles
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

create policy profiles_self_update on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

create policy profiles_self_insert on public.profiles
  for insert with check (id = auth.uid());

-- =========================================================================
-- shops — members can read; only owners can update
-- =========================================================================

create policy shops_member_select on public.shops
  for select using (public.is_shop_member(id));

create policy shops_owner_update on public.shops
  for update using (public.is_shop_owner(id));

create policy shops_owner_insert on public.shops
  for insert with check (owner_id = auth.uid());

-- =========================================================================
-- shop_members — members see same-shop members; owners manage
-- =========================================================================

create policy shop_members_select on public.shop_members
  for select using (public.is_shop_member(shop_id));

create policy shop_members_owner_write on public.shop_members
  for all using (public.is_shop_owner(shop_id))
        with check (public.is_shop_owner(shop_id));

-- =========================================================================
-- Generic shop-scoped tables — members can select; members can write
-- =========================================================================

-- categories
create policy categories_select on public.categories
  for select using (public.is_shop_member(shop_id));
create policy categories_write on public.categories
  for all using (public.is_shop_member(shop_id))
        with check (public.is_shop_member(shop_id));

-- tags
create policy tags_select on public.tags
  for select using (public.is_shop_member(shop_id));
create policy tags_write on public.tags
  for all using (public.is_shop_member(shop_id))
        with check (public.is_shop_member(shop_id));

-- suppliers
create policy suppliers_select on public.suppliers
  for select using (public.is_shop_member(shop_id));
create policy suppliers_write on public.suppliers
  for all using (public.is_shop_member(shop_id))
        with check (public.is_shop_member(shop_id));

-- products
create policy products_select on public.products
  for select using (public.is_shop_member(shop_id));
create policy products_write on public.products
  for all using (public.is_shop_member(shop_id))
        with check (public.is_shop_member(shop_id));

-- customers
create policy customers_select on public.customers
  for select using (public.is_shop_member(shop_id));
create policy customers_write on public.customers
  for all using (public.is_shop_member(shop_id))
        with check (public.is_shop_member(shop_id));

-- sales
create policy sales_select on public.sales
  for select using (public.is_shop_member(shop_id));
create policy sales_write on public.sales
  for all using (public.is_shop_member(shop_id))
        with check (public.is_shop_member(shop_id));

-- purchase_orders
create policy purchase_orders_select on public.purchase_orders
  for select using (public.is_shop_member(shop_id));
create policy purchase_orders_write on public.purchase_orders
  for all using (public.is_shop_member(shop_id))
        with check (public.is_shop_member(shop_id));

-- stock_log
create policy stock_log_select on public.stock_log
  for select using (public.is_shop_member(shop_id));
create policy stock_log_write on public.stock_log
  for all using (public.is_shop_member(shop_id))
        with check (public.is_shop_member(shop_id) and created_by = auth.uid());

-- supplier_price_history
create policy supplier_price_history_select on public.supplier_price_history
  for select using (public.is_shop_member(shop_id));
create policy supplier_price_history_write on public.supplier_price_history
  for all using (public.is_shop_member(shop_id))
        with check (public.is_shop_member(shop_id));

-- product_batches
create policy product_batches_select on public.product_batches
  for select using (public.is_shop_member(shop_id));
create policy product_batches_write on public.product_batches
  for all using (public.is_shop_member(shop_id))
        with check (public.is_shop_member(shop_id));

-- =========================================================================
-- Tables whose RLS depends on a parent row's shop_id
-- =========================================================================

-- sale_items — readable/writable if the parent sale belongs to your shop
create policy sale_items_select on public.sale_items
  for select using (
    exists(
      select 1 from public.sales s
      where s.id = sale_items.sale_id
        and public.is_shop_member(s.shop_id)
    )
  );
create policy sale_items_write on public.sale_items
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
create policy purchase_order_items_select on public.purchase_order_items
  for select using (
    exists(
      select 1 from public.purchase_orders po
      where po.id = purchase_order_items.purchase_order_id
        and public.is_shop_member(po.shop_id)
    )
  );
create policy purchase_order_items_write on public.purchase_order_items
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
create policy product_tags_select on public.product_tags
  for select using (
    exists(
      select 1 from public.products p
      where p.id = product_tags.product_id
        and public.is_shop_member(p.shop_id)
    )
  );
create policy product_tags_write on public.product_tags
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