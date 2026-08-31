# Migrate Shëlf from Directus to Supabase

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task. Stop after each stage for review.

**Goal:** Replace Directus (self-hosted in docker-compose) with Supabase as the backend. App keeps running on the VPS at `theflippantfoxpos.duckdns.org`. Fresh start — no data migration.

**Architecture:** SvelteKit server code talks to Supabase via `@supabase/supabase-js` + `@supabase/ssr`. Service-role key for trusted ops (signup, team invites), user-scoped client for normal reads/writes. SQL schema lives in `supabase/migrations/`. Sale creation moves into a single `security definer` SQL function to fix a current race condition. Auth handled by Supabase Auth — `auth.users` is the source of truth for identity; a `profiles` table holds app-level user fields.

**Tech Stack:** SvelteKit 2, `@supabase/supabase-js` v2, `@supabase/ssr` (cookie-based session helper), Postgres 15 (managed by Supabase), `pg_dump`/`psql` for schema work, Supabase CLI for migrations.

---

## Non-Goals

- Migrating existing data from Directus → Supabase. **Fresh start.** Tables will be created empty. (If the Directus Postgres container has any data the user wants to keep, they must export and import manually outside this plan.)
- Moving the SvelteKit app off the VPS.
- Building a custom admin UI. Supabase Studio replaces the Directus admin UI.
- Email templates beyond Supabase defaults.

---

## Assumptions

- User has a Supabase account and will create a free-tier project during Stage 0.
- Supabase free tier pause (1 week idle) is acceptable for now; addressed in Stage 7 with a keepalive.
- The current `database.sql` (with products/sales/etc.) is **historical**, not what's actually running — Directus created the real tables. The plan's schema mirrors `src/lib/types/directus.ts`, which is the actual source of truth.
- User accepts that Supabase Auth replaces the custom `users` + `sessions` tables. Old user data is not migrated.

---

## Decisions Locked In

| Topic | Decision | Reason |
|---|---|---|
| Auth | Supabase Auth | User request — no custom email service |
| Identity model | `auth.users.id` is the FK referenced by all other tables | Standard Supabase pattern |
| App-level user fields | New `profiles` table (1:1 with `auth.users`) | Keeps auth.users clean for future Supabase features |
| Custom `sessions` table | **Dropped** — Supabase manages JWTs | Sessions were a workaround for missing auth |
| Custom `users.password_hash` field | **Dropped** — Supabase manages password hashing | bcryptjs dep can be removed |
| Shop member invite flow | `supabase.auth.admin.inviteUserByEmail()` from service-role | Server-side, no SMTP needed (Supabase sends the invite email) |
| Sale creation | Single SQL function `create_sale(...)` called via `rpc()` | Fixes current race condition |
| PO receive | Single SQL function `receive_purchase_order(...)` called via `rpc()` | Same race fix |
| Uploads | Supabase Storage buckets `product-images`, `avatars`, `bills` | Replaces `directus_uploads` volume |
| Migrations tool | `supabase` CLI with `supabase/migrations/` | Standard Supabase workflow |

---

## Files Inventory

### Files to delete
- `src/lib/server/directus.ts`
- `src/lib/types/directus.ts`
- `scripts/bootstrap-directus.ts` (referenced by `db:bootstrap` in package.json)
- `database.sql` (historical Supabase-era file, replaced by `supabase/migrations/`)
- `ANALYTICS.md` references "Directus" — sweep in Stage 8
- `DEPLOYMENT.md` / `DEPLOYMENT_GUIDE.md` reference Directus/Postgres setup — sweep in Stage 8
- `README.md` — sweep in Stage 8

### Files to create
- `supabase/config.toml` (from `supabase init`)
- `supabase/migrations/0001_init.sql`
- `supabase/migrations/0002_rls_policies.sql`
- `supabase/migrations/0003_functions_create_sale.sql`
- `supabase/migrations/0004_functions_receive_purchase_order.sql`
- `supabase/migrations/0005_storage_buckets.sql`
- `src/lib/server/supabase.ts` (clients factory)
- `src/lib/server/profile.ts` (lookups against `profiles`)
- `src/lib/server/storage.ts` (upload helpers)
- `src/lib/types/db.ts` (replaces types/directus.ts, uses `Database` generic)
- `tests/db-roundtrip.test.ts` (smoke test: insert shop, insert product, read back)

### Files to modify (all 50)
Every file that currently imports from `$lib/server/directus` or `$lib/types/directus`. Concrete list in Stage 4.

---

## Stage 0 — Pre-flight (manual, no app changes)

**Objective:** Verify Supabase access and create the project before touching code.

**Steps:**
1. User goes to https://supabase.com/dashboard, creates a free-tier project.
2. User copies from Project Settings → API:
   - `Project URL` → `PUBLIC_SUPABASE_URL`
   - `anon` key → `PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (server-only, never `PUBLIC_*`)
3. Save these into `.env` (gitignored) and `.env.example` (placeholders).
4. Install Supabase CLI locally: `brew install supabase/tap/supabase` (mac) or `npx supabase --version` to check it's available.

**Verification:**
- `npx supabase --version` prints version ≥ 1.180
- User has all three keys in `.env`

**Commit:** None yet.

---

## Stage 1 — Initialize Supabase project locally

**Objective:** Set up `supabase/` directory and link to the cloud project.

**Files:**
- Create: `supabase/config.toml`, `supabase/migrations/.gitkeep`

**Step 1:** From repo root, run `npx supabase init`. Confirm `supabase/config.toml` exists.

**Step 2:** Run `npx supabase login` (opens browser for auth).

**Step 3:** Get project ref from Supabase dashboard URL (`https://supabase.com/dashboard/project/<ref>`), then:
```bash
npx supabase link --project-ref <ref>
```
Enter database password when prompted.

**Verification:**
- `npx supabase status` shows the project linked (or fails gracefully if not running locally).
- `.supabase/` directory exists locally (already gitignored in standard Supabase templates, verify in `.gitignore`).

**Commit:**
```bash
git add supabase/ .gitignore
git commit -m "chore: initialize supabase project"
```

---

## Stage 2 — Write the initial schema migration

**Objective:** Create all 14 tables in Supabase matching the current Directus schema.

**Files:**
- Create: `supabase/migrations/0001_init.sql`

**Schema (derived from `src/lib/types/directus.ts`):**

```sql
-- 0001_init.sql
-- All tables use uuid PKs with gen_random_uuid()
create extension if not exists pgcrypto;

-- profiles: 1:1 with auth.users, holds app-level user fields
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text not null,
  last_name text not null default '',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- shops
create table public.shops (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  country_code text not null,
  currency_code text not null,
  currency_symbol text not null,
  currency_locale text not null,
  timezone text not null,
  date_format text not null,
  time_format text not null check (time_format in ('12h','24h')),
  tax_rate numeric(5,2) not null default 0,
  tax_inclusive boolean not null default false,
  tax_name text not null default 'Tax',
  theme text not null default 'system' check (theme in ('light','dark','system')),
  primary_color text not null default '#000000',
  sidebar_bg text not null default '#ffffff',
  onboarding_complete boolean not null default false,
  onboarding_step text not null default 'shop',
  low_stock_threshold integer not null default 5,
  receipt_header text,
  receipt_footer text,
  owner_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- shop_members: links profiles to shops with a role
create table public.shop_members (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('owner','manager','cashier')),
  permissions jsonb,
  status text not null default 'active' check (status in ('active','invited','suspended')),
  created_at timestamptz not null default now(),
  unique(shop_id, user_id)
);

-- categories, tags
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  name text not null,
  icon text not null default 'tag',
  color text not null default '#888888',
  sort_order integer not null default 0,
  archived_at timestamptz
);
create index on public.categories(shop_id);

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  name text not null,
  color text not null default '#888888',
  unique(shop_id, name)
);

-- products
create table public.products (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  name text not null,
  sku text not null,
  description text,
  category_id uuid references public.categories(id) on delete set null,
  price numeric(10,2) not null default 0,
  cost_price numeric(10,2) not null default 0,
  qty integer not null default 0,
  low_stock_threshold integer not null default 5,
  reorder_point integer,
  preferred_supplier_id uuid references public.suppliers(id) on delete set null,
  unit text not null default 'pcs',
  image_url text,
  barcode text,
  expiry_tracking boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(shop_id, sku)
);
create index on public.products(shop_id);
create index on public.products(category_id);

-- product_tags (many-to-many)
create table public.product_tags (
  product_id uuid not null references public.products(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  primary key(product_id, tag_id)
);

-- customers
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  name text not null,
  phone text,
  email text,
  notes text,
  visit_count integer not null default 0,
  total_spent numeric(10,2) not null default 0,
  last_visit timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- sales
create table public.sales (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  sale_ref text not null,
  customer_id uuid references public.customers(id) on delete set null,
  served_by uuid not null references public.profiles(id),
  subtotal numeric(10,2) not null default 0,
  discount_type text not null default 'amount' check (discount_type in ('amount','percent')),
  discount_value numeric(10,2) not null default 0,
  discount_amount numeric(10,2) not null default 0,
  total numeric(10,2) not null default 0,
  tax_amount numeric(10,2) not null default 0,
  payment_method text not null check (payment_method in ('cash','credit','transfer')),
  notes text,
  voided_at timestamptz,
  voided_by uuid references public.profiles(id),
  void_reason text,
  created_at timestamptz not null default now()
);
create index on public.sales(shop_id, created_at desc);

-- sale_items
create table public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  product_id uuid not null references public.products(id),
  product_name text not null,
  product_sku text not null,
  unit_price numeric(10,2) not null,
  qty integer not null check (qty > 0),
  line_total numeric(10,2) not null
);

-- stock_log
create table public.stock_log (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  delta integer not null,
  reason text not null check (reason in ('sale','restock','adjustment','void')),
  reference text,
  purchase_order_id uuid references public.purchase_orders(id) on delete set null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
create index on public.stock_log(shop_id, created_at desc);

-- suppliers
create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  name text not null,
  contact_name text,
  phone text,
  email text,
  address text,
  payment_terms text not null check (payment_terms in ('cash','credit','net_15','net_30','net_60','consignment')),
  currency_code text not null,
  lead_time_days integer,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- purchase_orders
create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id),
  order_ref text not null,
  status text not null check (status in ('draft','ordered','partial','received','cancelled')),
  order_date date not null,
  expected_delivery_date date,
  received_date date,
  subtotal numeric(10,2) not null default 0,
  tax_amount numeric(10,2) not null default 0,
  shipping_cost numeric(10,2) not null default 0,
  total_cost numeric(10,2) not null default 0,
  bill_image_url text,
  notes text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- purchase_order_items
create table public.purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.purchase_orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  product_sku text not null,
  quantity_ordered integer not null check (quantity_ordered > 0),
  quantity_received integer not null default 0,
  unit_cost numeric(10,2) not null,
  line_total numeric(10,2) not null,
  is_new_product boolean not null default false,
  notes text
);

-- supplier_price_history
create table public.supplier_price_history (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id),
  product_id uuid not null references public.products(id),
  unit_cost numeric(10,2) not null,
  currency_code text not null,
  purchase_order_id uuid references public.purchase_orders(id) on delete set null,
  recorded_at timestamptz not null default now(),
  notes text
);

-- product_batches
create table public.product_batches (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  purchase_order_item_id uuid references public.purchase_order_items(id) on delete set null,
  batch_number text,
  expiry_date date,
  quantity_remaining integer not null,
  created_at timestamptz not null default now()
);

-- updated_at trigger function (reused by multiple tables)
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger trg_shops_updated_at before update on public.shops
  for each row execute function public.set_updated_at();
create trigger trg_products_updated_at before update on public.products
  for each row execute function public.set_updated_at();
create trigger trg_customers_updated_at before update on public.customers
  for each row execute function public.set_updated_at();
create trigger trg_suppliers_updated_at before update on public.suppliers
  for each row execute function public.set_updated_at();
create trigger trg_purchase_orders_updated_at before update on public.purchase_orders
  for each row execute function public.set_updated_at();
```

**Apply:**
```bash
npx supabase db push
```

**Verification:**
- Supabase dashboard → Table Editor shows all 16 tables (14 + profiles + product_tags)
- `select count(*) from information_schema.tables where table_schema='public'` returns 16

**Commit:**
```bash
git add supabase/migrations/0001_init.sql
git commit -m "feat(db): initial schema for 14 tables + profiles"
```

---

## Stage 3 — Row Level Security

**Objective:** Lock down tables so users only see their own shops' data.

**Files:**
- Create: `supabase/migrations/0002_rls_policies.sql`

```sql
-- 0002_rls_policies.sql

-- Helper: is the current user a member of this shop?
create or replace function public.is_shop_member(shop uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists(
    select 1 from public.shop_members
    where shop_id = shop and user_id = auth.uid() and status = 'active'
  );
$$;

-- Helper: is the current user an owner of this shop?
create or replace function public.is_shop_owner(shop uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists(
    select 1 from public.shop_members
    where shop_id = shop and user_id = auth.uid() and role = 'owner' and status = 'active'
  );
$$;

-- Enable RLS on all public tables
alter table public.profiles enable row level security;
alter table public.shops enable row level security;
alter table public.shop_members enable row level security;
alter table public.categories enable row level security;
alter table public.tags enable row level security;
alter table public.products enable row level security;
alter table public.product_tags enable row level security;
alter table public.customers enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.stock_log enable row level security;
alter table public.suppliers enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.purchase_order_items enable row level security;
alter table public.supplier_price_history enable row level security;
alter table public.product_batches enable row level security;

-- profiles: users read/update their own profile; service role bypasses
create policy "own profile" on public.profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

-- shops: members can read; only owners can update
create policy "shop members read" on public.shops
  for select using (public.is_shop_member(id));
create policy "owners update shop" on public.shops
  for update using (public.is_shop_owner(id));
create policy "owners insert shop" on public.shops
  for insert with check (owner_id = auth.uid());

-- shop_members: members see themselves + same-shop members; owners manage
create policy "see same-shop members" on public.shop_members
  for select using (public.is_shop_member(shop_id));
create policy "owners manage members" on public.shop_members
  for all using (public.is_shop_owner(shop_id)) with check (public.is_shop_owner(shop_id));

-- Generic "shop members read/write" policy for all shop-scoped tables
create policy "shop_members read"   on public.categories             for select using (public.is_shop_member(shop_id));
create policy "shop_members write"  on public.categories             for all    using (public.is_shop_member(shop_id)) with check (public.is_shop_member(shop_id));
create policy "shop_members read"   on public.tags                   for select using (public.is_shop_member(shop_id));
create policy "shop_members write"  on public.tags                   for all    using (public.is_shop_member(shop_id)) with check (public.is_shop_member(shop_id));
create policy "shop_members read"   on public.products               for select using (public.is_shop_member(shop_id));
create policy "shop_members write"  on public.products               for all    using (public.is_shop_member(shop_id)) with check (public.is_shop_member(shop_id));
create policy "shop_members read"   on public.product_tags           for all    using (
  exists(select 1 from public.products p where p.id = product_id and public.is_shop_member(p.shop_id))
);
create policy "shop_members read"   on public.customers              for select using (public.is_shop_member(shop_id));
create policy "shop_members write"  on public.customers              for all    using (public.is_shop_member(shop_id)) with check (public.is_shop_member(shop_id));
create policy "shop_members read"   on public.sales                  for select using (public.is_shop_member(shop_id));
create policy "shop_members write"  on public.sales                  for all    using (public.is_shop_member(shop_id)) with check (public.is_shop_member(shop_id));
create policy "shop_members read"   on public.sale_items             for all    using (
  exists(select 1 from public.sales s where s.id = sale_id and public.is_shop_member(s.shop_id))
);
create policy "shop_members read"   on public.stock_log              for select using (public.is_shop_member(shop_id));
create policy "shop_members write"  on public.stock_log              for insert with check (public.is_shop_member(shop_id) and created_by = auth.uid());
create policy "shop_members read"   on public.suppliers              for select using (public.is_shop_member(shop_id));
create policy "shop_members write"  on public.suppliers              for all    using (public.is_shop_member(shop_id)) with check (public.is_shop_member(shop_id));
create policy "shop_members read"   on public.purchase_orders        for select using (public.is_shop_member(shop_id));
create policy "shop_members write"  on public.purchase_orders        for all    using (public.is_shop_member(shop_id)) with check (public.is_shop_member(shop_id));
create policy "shop_members read"   on public.purchase_order_items   for all    using (
  exists(select 1 from public.purchase_orders po where po.id = purchase_order_id and public.is_shop_member(po.shop_id))
);
create policy "shop_members read"   on public.supplier_price_history for select using (public.is_shop_member(shop_id));
create policy "shop_members write"  on public.supplier_price_history for insert with check (public.is_shop_member(shop_id));
create policy "shop_members read"   on public.product_batches        for select using (public.is_shop_member(shop_id));
create policy "shop_members write"  on public.product_batches        for all    using (public.is_shop_member(shop_id)) with check (public.is_shop_member(shop_id));
```

**Apply:** `npx supabase db push`

**Verification:**
- In Supabase Studio → Authentication → Policies, confirm every public table has policies.
- Sanity: as anon, `select * from products` returns 0 rows; as authed, returns only your shop's.

**Commit:**
```bash
git add supabase/migrations/0002_rls_policies.sql
git commit -m "feat(db): RLS policies + is_shop_member helper"
```

---

## Stage 4 — Server-side Supabase client + Database types

**Objective:** Replace `$lib/server/directus.ts` and `$lib/types/directus.ts` with Supabase equivalents.

**Files:**
- Create: `src/lib/types/db.ts` — generated types via `npx supabase gen types typescript --linked > src/lib/types/db.ts`
- Create: `src/lib/server/supabase.ts`
- Delete: `src/lib/server/directus.ts`, `src/lib/types/directus.ts`

**`src/lib/server/supabase.ts`:**
```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import type { RequestEvent } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import type { Database } from '$lib/types/db';

/**
 * Service-role client — bypasses RLS. Use ONLY for:
 *   - auth.admin.* calls (createUser, inviteUserByEmail, etc.)
 *   - server-side system operations triggered by admin actions
 * Never expose this to the browser.
 */
export function adminClient(): SupabaseClient<Database> {
  return createClient<Database>(
    PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

/**
 * User-scoped client — RLS-enforced. Use this for normal reads/writes
 * that should respect the authenticated user's permissions.
 * Reads the auth token from event.cookies via @supabase/ssr.
 */
export function userClient(event: RequestEvent): SupabaseClient<Database> {
  return createServerClient<Database>(
    PUBLIC_SUPABASE_URL,
    PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => event.cookies.getAll(),
        setAll: (cookies) => {
          for (const { name, value, options } of cookies) {
            event.cookies.set(name, value, { path: '/', ...options });
          }
        },
      },
    }
  );
}
```

**Step 1:** Install deps: `npm uninstall @directus/sdk && npm install @supabase/supabase-js @supabase/ssr`

**Step 2:** Add to `.env`:
```
PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
PUBLIC_SUPABASE_ANON_KEY=<anon>
SUPABASE_SERVICE_ROLE_KEY=<service-role>
```

**Step 3:** Generate types:
```bash
npx supabase gen types typescript --linked --schema public > src/lib/types/db.ts
```

**Step 4:** Verify `npm run check` still passes (the new types file should compile; old directus.ts references will fail and are expected — they'll be fixed in Stage 5).

**Commit:**
```bash
git add src/lib/types/db.ts src/lib/server/supabase.ts package.json package-lock.json
git rm src/lib/server/directus.ts src/lib/types/directus.ts
git commit -m "feat(server): supabase clients + generated db types, drop directus types"
```

---

## Stage 5 — Auth: rewrite `auth.ts` and `hooks.server.ts`

**Objective:** Replace custom bcrypt+sessions with Supabase Auth. Keep `event.locals.user`, `event.locals.shopMember`, `event.locals.currentShop` shape so call sites in Stage 6 are simple.

**Files:**
- Modify: `src/lib/server/auth.ts` (replace contents)
- Modify: `src/hooks.server.ts` (replace `loadShopContext`)
- Modify: `src/app.d.ts` (drop `directus` field)
- Modify: `src/lib/config/public.ts` (drop `PUBLIC_DIRECTUS_URL`, add no-op)
- Delete: `bcryptjs` usage (no longer needed)

**`src/lib/server/auth.ts` (new):**
```ts
import { adminClient, userClient } from './supabase';
import type { RequestEvent } from '@sveltejs/kit';
import type { Database } from '$lib/types/db';

export type Profile = Database['public']['Tables']['profiles']['Row'];
export type Shop = Database['public']['Tables']['shops']['Row'];
export type ShopMember = Database['public']['Tables']['shop_members']['Row'];

/**
 * Sign up a new user (called from /api/auth/register).
 * Returns { userId } on success, throws on failure.
 */
export async function signUp(
  email: string,
  password: string,
  firstName: string,
  lastName: string
): Promise<string> {
  const admin = adminClient();

  // 1. Create auth user
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,            // skip email confirm during signup; Supabase still sends a confirmation by default
    user_metadata: { first_name: firstName, last_name: lastName },
  });
  if (error) throw error;
  const userId = data.user.id;

  // 2. Create profile row (trigger could also do this — see notes)
  await admin.from('profiles').insert({
    id: userId,
    first_name: firstName,
    last_name: lastName,
  });

  return userId;
}

/**
 * Look up the active shop member for a user.
 * If shopIdHint is given, prefer that shop (otherwise first active membership).
 */
export async function getActiveMembership(userId: string, shopIdHint?: string | null) {
  const admin = adminClient();
  let q = admin.from('shop_members')
    .select('id, shop_id, user_id, role, permissions, status')
    .eq('user_id', userId)
    .eq('status', 'active')
    .limit(1);
  if (shopIdHint) q = q.eq('shop_id', shopIdHint);
  const { data: members } = await q;
  const member = members?.[0];
  if (!member) return null;

  const { data: shop } = await admin.from('shops').select('*').eq('id', member.shop_id).single();
  if (!shop) return null;

  const { data: profile } = await admin.from('profiles').select('*').eq('id', userId).single();

  return { profile, shop, member };
}

/**
 * Invite a teammate by email. Uses Supabase Auth invite (sends email via Supabase).
 */
export async function inviteTeammate(
  email: string,
  role: 'manager' | 'cashier',
  shopId: string
): Promise<string> {
  const admin = adminClient();
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${process.env.PUBLIC_APP_URL}/login`,
  });
  if (error) throw error;
  const userId = data.user.id;

  await admin.from('profiles').upsert({ id: userId, first_name: '', last_name: '' });
  await admin.from('shop_members').insert({
    shop_id: shopId,
    user_id: userId,
    role,
    status: 'invited',
  });
  return userId;
}
```

**Note on `profiles` creation:** A cleaner pattern is a Postgres trigger on `auth.users` insert that auto-creates a `profiles` row. Recommendation: add it as `0001_init.sql` later revision or as a new `0001b_profiles_trigger.sql` migration in Stage 5.

**`src/hooks.server.ts` (rewritten `loadShopContext`):**
```ts
import type { Handle } from '@sveltejs/kit';
import { userClient } from '$lib/server/supabase';
import { getActiveMembership } from '$lib/server/auth';

const SHOP_COOKIE = 'shelf-current-shop';

export const handle: Handle = async ({ event, resolve }) => {
  event.locals.user = null;
  event.locals.shopMember = null;
  event.locals.currentShop = null;

  // 1. Resolve user from session cookie
  const supabase = userClient(event);
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const shopIdHint = event.cookies.get(SHOP_COOKIE);
    const ctx = await getActiveMembership(user.id, shopIdHint);
    if (ctx) {
      event.locals.user        = ctx.profile;
      event.locals.shopMember  = ctx.member;
      event.locals.currentShop = ctx.shop;

      if (!shopIdHint) {
        event.cookies.set(SHOP_COOKIE, ctx.shop.id, {
          httpOnly: false, path: '/', sameSite: 'lax', maxAge: 60 * 60 * 24 * 30,
        });
      }
    }
  }

  return resolve(event);
};
```

**`src/app.d.ts` (modified):**
```ts
import type { Profile, Shop, ShopMember } from '$lib/server/auth';
declare global {
  namespace App {
    interface Locals {
      user:        Profile | null;
      shopMember:  ShopMember | null;
      currentShop: Shop | null;
    }
    interface Error { message: string }
  }
}
export {};
```

**Step 1:** Modify each file.
**Step 2:** `npm run check` — expect failure on files that still import directus. That's Stage 6's job.

**Commit:**
```bash
git add src/lib/server/auth.ts src/hooks.server.ts src/app.d.ts src/lib/config/public.ts
git commit -m "feat(auth): supabase auth replaces bcrypt+sessions"
```

---

## Stage 6 — Rewrite all 47 API/page routes

**Objective:** Replace every Directus SDK call with Supabase. Each route is a bite-sized task; we'll go one collection at a time.

**Files to modify (full list, by category):**

### Auth + onboarding
- `src/routes/api/auth/register/+server.ts`
- `src/routes/api/auth/forgot-password/+server.ts` — **dropped**, replaced by `supabase.auth.resetPasswordForEmail()` link from client
- `src/routes/api/auth/reset-password/+server.ts` — **dropped**, Supabase handles session creation on the update
- `src/routes/api/auth/select-shop/+server.ts` — keep, no Directus
- `src/routes/api/onboarding/appearance/+server.ts`
- `src/routes/api/onboarding/categories/+server.ts`
- `src/routes/api/onboarding/locale/+server.ts`
- `src/routes/api/onboarding/shop/+server.ts`
- `src/routes/api/onboarding/team/+server.ts`
- `src/routes/(app)/+layout.server.ts`
- `src/routes/(app)/settings/team/+page.server.ts`

### Products / categories / tags
- `src/routes/api/products/+server.ts`
- `src/routes/api/products/[id]/+server.ts`
- `src/routes/api/categories/+server.ts`
- `src/routes/api/categories/[id]/+server.ts`
- `src/routes/api/tags/+server.ts`
- `src/routes/api/tags/[id]/+server.ts`
- `src/routes/api/stock/+server.ts`
- `src/routes/(app)/inventory/+page.server.ts`

### Sales + analytics + history
- `src/routes/api/sales/+server.ts` (calls `rpc('create_sale', ...)` — see Stage 6a)
- `src/routes/api/sales/[id]/+server.ts`
- `src/routes/api/analytics/+server.ts`
- `src/routes/(app)/analytics/+page.server.ts`
- `src/routes/(app)/history/+page.server.ts`
- `src/routes/(app)/history/[id]/+page.server.ts`
- `src/routes/(app)/sale/+page.server.ts`

### Customers
- `src/routes/api/customers/+server.ts`
- `src/routes/api/customers/[id]/+server.ts`
- `src/routes/(app)/customers/+page.server.ts`
- `src/routes/(app)/customers/[id]/+page.server.ts`

### Suppliers / purchase orders / restocking
- `src/routes/api/suppliers/+server.ts`
- `src/routes/api/suppliers/[id]/+server.ts`
- `src/routes/api/purchase-orders/+server.ts`
- `src/routes/api/purchase-orders/[id]/+server.ts`
- `src/routes/api/purchase-orders/[id]/items/+server.ts`
- `src/routes/api/purchase-orders/[id]/items/[itemId]/+server.ts`
- `src/routes/api/purchase-orders/[id]/receive/+server.ts` (calls `rpc('receive_purchase_order', ...)` — see Stage 6a)
- `src/routes/api/price-comparison/+server.ts`
- `src/routes/api/restocking/+server.ts`
- `src/routes/api/restocking/analytics/+server.ts`
- `src/routes/(app)/restocking/orders/new/+page.server.ts`

### Settings + users
- `src/routes/api/settings/+server.ts`
- `src/routes/api/users/+server.ts`
- `src/routes/api/users/[id]/+server.ts`
- `src/routes/(app)/settings/categories/+page.server.ts`

**Translation patterns (the bulk of the work):**

| Directus | Supabase |
|---|---|
| `adminClient().request(readItems('products', { filter: { shop_id: { _eq: id } }, limit: -1 }))` | `userClient(event).from('products').select('*').eq('shop_id', id)` |
| `filter: { shop_id: { _eq: x }, name: { _icontains: s } }` | `.eq('shop_id', x).ilike('name', \`%${s}%\`)` |
| `fields: ['id', 'category.name', 'category.color']` | `.select('id, category:categories(name,color)')` |
| `createItem('products', body)` | `.from('products').insert(body).select().single()` |
| `updateItem('products', id, body)` | `.from('products').update(body).eq('id', id).select().single()` |
| `deleteItem('products', id)` (soft) | `.from('products').update({ archived_at: now }).eq('id', id)` |
| `readItem('products', id, { fields: [...] })` | `.from('products').select('*').eq('id', id).single()` |
| `sort: ['-date_created']` | `.order('created_at', { ascending: false })` |
| `limit: 50, page: 2` | `.range(50, 99)` (offset-based, simpler than cursor) |
| `_or: [{...}, {...}]` | `.or('name.ilike.%x%,sku.ilike.%x%')` |
| `_in: [ids]` | `.in('id', ids)` |
| `_null: true` / `_null: false` | `.is('field', null)` / `.not('field', 'is', null)` |

**Strategy:** Tasks grouped by collection. Each task = rewrite all routes for one collection. Run `npm run check` after each collection. Commit.

**Example task:**

### Task: Rewrite products routes
**Files:** `src/routes/api/products/+server.ts`, `src/routes/api/products/[id]/+server.ts`, `src/routes/(app)/inventory/+page.server.ts`

**GET handler — original:**
```ts
const products = await adminClient().request(readItems('products', {
  filter, fields: ['*', 'category.id', 'category.name', 'category.color', 'category.icon'],
  sort: ['name'], limit: -1,
}));
```

**GET handler — new:**
```ts
const supabase = userClient(event);
let q = supabase.from('products')
  .select('id, name, sku, price, cost_price, qty, low_stock_threshold, barcode, image_url, archived_at, category:categories(id,name,color,icon)')
  .eq('shop_id', shopId)
  .is('archived_at', null)
  .order('name');
if (cat) q = q.eq('category_id', cat);
if (search) q = q.or(`name.ilike.%${search}%,sku.ilike.%${search}%`);
const { data: products } = await q;
```

**Verification:** `npm run check` passes for these 3 files. (Will fail elsewhere — that's expected.)

**Commit:**
```bash
git add src/routes/api/products src/routes/(app)/inventory
git commit -m "feat(api): rewrite products routes to supabase"
```

**Repeat per collection. Final task in Stage 6:**
```bash
npm run check    # zero errors
git add -A
git commit -m "feat(api): all routes migrated to supabase"
```

---

## Stage 6a — Atomic SQL functions for sale + PO receive

**Objective:** Replace the multi-round-trip `POST /api/sales` and `POST /api/purchase-orders/[id]/receive` with single transactional SQL functions called via `rpc()`.

**Files:**
- Create: `supabase/migrations/0003_functions_create_sale.sql`
- Create: `supabase/migrations/0004_functions_receive_purchase_order.sql`

**`0003_functions_create_sale.sql`:**
```sql
create or replace function public.create_sale(
  p_shop_id uuid,
  p_customer_id uuid,
  p_served_by uuid,
  p_payment_method text,
  p_notes text,
  p_subtotal numeric,
  p_discount_type text,
  p_discount_value numeric,
  p_discount_amount numeric,
  p_tax_amount numeric,
  p_total numeric,
  p_items jsonb   -- [{product_id, name, sku, qty, unit_price}]
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
begin
  -- Ref like SL-20260830-AB12
  v_ref := 'SL-' || to_char(now(), 'YYYYMMDD') || '-' ||
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

    insert into public.sale_items
      (sale_id, product_id, product_name, product_sku, unit_price, qty, line_total)
    values
      (v_sale.id, (v_item->>'product_id')::uuid,
       v_item->>'name', v_item->>'sku',
       (v_item->>'unit_price')::numeric, (v_item->>'qty')::int, v_line_total);

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

-- Allow authenticated callers (RLS via shop membership is checked inside)
grant execute on function public.create_sale to authenticated;
```

**Call from route:**
```ts
const supabase = userClient(event);
const { data: sale, error } = await supabase.rpc('create_sale', {
  p_shop_id: locals.currentShop.id,
  p_customer_id: customer_id ?? null,
  p_served_by: locals.user.id,
  p_payment_method: payment_method,
  p_notes: notes ?? null,
  p_subtotal: subtotal,
  p_discount_type: discount_type ?? 'amount',
  p_discount_value: discount_value ?? 0,
  p_discount_amount: discount_amount ?? 0,
  p_tax_amount: tax_amount ?? 0,
  p_total: total,
  p_items: items,
});
```

**`0004_functions_receive_purchase_order.sql`: similar shape** — wraps the receive logic in one transaction.

**Verification:** After Stage 6a is applied + routes call `rpc`, run a smoke test that creates a sale with 3 items and confirm:
- 1 sale row
- 3 sale_items rows
- 3 stock_log rows (negative)
- product.qty decremented for each
- customer visit_count/total_spent updated (if customer passed)

**Commit:**
```bash
git add supabase/migrations/0003_functions_create_sale.sql
git commit -m "feat(db): create_sale atomic function"
git add supabase/migrations/0004_functions_receive_purchase_order.sql
git commit -m "feat(db): receive_purchase_order atomic function"
```

---

## Stage 7 — Storage buckets + upload helper

**Objective:** Replace `directus_uploads` volume with Supabase Storage.

**Files:**
- Create: `supabase/migrations/0005_storage_buckets.sql`
- Create: `src/lib/server/storage.ts`

**`0005_storage_buckets.sql`:**
```sql
insert into storage.buckets (id, name, public) values
  ('product-images', 'product-images', true),
  ('avatars',        'avatars',        true),
  ('bills',          'bills',          false)
on conflict (id) do nothing;

-- product-images: any authenticated user can upload (path includes shop_id for organization)
create policy "auth upload product-images" on storage.objects
  for insert to authenticated with check (bucket_id = 'product-images');
create policy "public read product-images" on storage.objects
  for select using (bucket_id = 'product-images');

-- similar policies for avatars and bills
```

**`src/lib/server/storage.ts`:**
```ts
import { adminClient } from './supabase';

export async function uploadFile(
  bucket: 'product-images' | 'avatars' | 'bills',
  path: string,
  body: Buffer | Blob,
  contentType: string
): Promise<string> {
  const admin = adminClient();
  const { error } = await admin.storage.from(bucket).upload(path, body, {
    contentType, upsert: true,
  });
  if (error) throw error;
  const { data } = admin.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}
```

**Verification:** Manual: upload an image via Supabase dashboard → confirm URL works in browser.

**Commit:**
```bash
git add supabase/migrations/0005_storage_buckets.sql src/lib/server/storage.ts
git commit -m "feat(storage): supabase storage buckets + upload helper"
```

---

## Stage 8 — Cutover: remove Directus from infra

**Objective:** Strip Directus out of `docker-compose.yml`, Dockerfile, nginx, env files, docs.

**Files:**
- Modify: `docker-compose.yml` — drop `directus` service, drop `directus_uploads` and `directus_extensions` volumes, drop `DIRECTUS_*` references
- Modify: `Dockerfile` — drop `ARG DIRECTUS_URL`, `ARG DIRECTUS_ADMIN_TOKEN`; replace with `ARG PUBLIC_SUPABASE_URL`, `ARG PUBLIC_SUPABASE_ANON_KEY`
- Modify: `nginx/conf.d/*.conf` — drop Directus upstream
- Modify: `.env.example` — drop `DIRECTUS_*`, add `PUBLIC_SUPABASE_*` and `SUPABASE_SERVICE_ROLE_KEY`
- Modify: `package.json` — drop `"db:bootstrap": "npx tsx scripts/bootstrap-directus.ts"`
- Delete: `scripts/bootstrap-directus.ts`
- Modify: `README.md`, `DEPLOYMENT.md`, `DEPLOYMENT_GUIDE.md`, `ANALYTICS.md` — sweep all references
- Delete: `database.sql` (historical, replaced by `supabase/migrations/`)

**`docker-compose.yml` removals:**
- Remove the entire `directus:` service block.
- Remove `directus_uploads:` and `directus_extensions:` from `volumes:`.
- Remove `directus` from `nginx.depends_on`.
- Remove `directus_uploads:` and `directus_extensions:` references if any in the shelf app.

**`Dockerfile` changes:**
- Replace `ARG DIRECTUS_URL` with `ARG PUBLIC_SUPABASE_URL`
- Replace `ARG DIRECTUS_ADMIN_TOKEN` with `ARG PUBLIC_SUPABASE_ANON_KEY`
- Note: `SUPABASE_SERVICE_ROLE_KEY` is **NOT** a build arg — it's runtime-only via `.env.production` because it must not be baked into the image.

**`package.json`:**
```json
"scripts": {
  "dev": "vite dev",
  "build": "vite build",
  "preview": "vite preview",
  "prepare": "svelte-kit sync || echo ''",
  "check": "svelte-kit sync && svelte-check --tsconfig ./tsconfig.json",
  "check:watch": "svelte-kit sync && svelte-check --tsconfig ./tsconfig.json --watch",
  "type-check": "svelte-kit sync && tsc --noEmit",
  "db:types": "supabase gen types typescript --linked --schema public > src/lib/types/db.ts"
}
```

**Verification:**
- `grep -rn directus src/ docker-compose.yml Dockerfile nginx/ package.json` returns zero matches.
- `docker compose config` validates.

**Commit:**
```bash
git add -A
git commit -m "chore: remove directus from infra, env, docs"
```

---

## Stage 9 — Free-tier keepalive

**Objective:** Prevent the Supabase project from pausing after 1 week of inactivity.

**Files:**
- `scripts/supabase-keepalive.sh` — bash script, pings `/auth/v1/health` + `/rest/v1/` + `/storage/v1/bucket`

**Cron entry on VPS:**
```
# /etc/cron.d/supabase-keepalive
# Pulls cloud Supabase URL/key from /etc/environment
0 6 * * * root CLOUD_SUPABASE_URL=https://abc.supabase.co CLOUD_SUPABASE_ANON_KEY=*** /home/<user>/Projects/shelf/scripts/supabase-keepalive.sh >> /var/log/supabase-keepalive.log 2>&1
```

**Verification:** Run the script manually — should log "keepalive ok".

**Commit:**
```bash
git add scripts/keepalive.ts
git commit -m "chore: supabase free-tier keepalive script"
```

---

## Stage 10 — End-to-end smoke test

**Objective:** Confirm a full user flow works against Supabase.

**Test cases (manual):**
1. Sign up new user → `profiles` row created.
2. Log in → `locals.user` populated, `locals.shopMember` and `locals.currentShop` are null → redirected to `/onboarding/shop`.
3. Complete onboarding → `shops` row + `shop_members` row with role=owner.
4. Create 3 products.
5. Process a sale of 2 products → confirm:
   - 1 sale, 2 sale_items, 2 stock_log rows
   - product.qty decremented
   - atomic (kill server mid-flow, no partial state — manual destructive test optional)
6. Receive a purchase order → confirm atomicity.
7. Invite a teammate via email → confirm invite email received (Supabase handles).
8. Logout → session cleared.
9. Log back in → redirected to home, shop context restored.

**Acceptance:** All 9 cases pass. App is usable end-to-end on Supabase.

---

## Risks & Tradeoffs

- **Free tier pause risk.** Mitigated by Stage 9 keepalive, but if the VPS goes down for >7 days without the keepalive running, the project pauses. Mitigation: monitor with an external uptime service (UptimeRobot free tier).
- **Service role key in `.env.production`.** This key bypasses RLS — if leaked, an attacker can read/write everything. Mitigation: keep it server-only (no `PUBLIC_` prefix), rotate quarterly via Supabase dashboard.
- **Email deliverability for team invites.** Supabase Auth uses its own SMTP by default which has rate limits. Mitigation: configure a custom SMTP (Resend free tier) in Supabase project settings if invites become unreliable.
- **Atomic functions = `security definer`.** The `create_sale` and `receive_purchase_order` functions run with table-owner privileges. We still enforce `auth.uid()` checks inside if needed (e.g., verify membership before allowing the sale).
- **No data migration.** Old Directus data is lost. Mitigation: if the user later wants historical data, write a one-off export from `docker exec shelf_postgres pg_dump -t ...` and import manually.
- **One big diff.** 50 files changed is hard to review. Mitigation: stages are committed separately with focused messages, so `git log --oneline` gives a clean history.
- **Type drift.** `supabase gen types` regenerates types every time the schema changes. Mitigation: add `"db:types"` script and run it as part of every migration.

---

## Open Questions for Reviewer

1. **Should I add a Postgres trigger** (`on auth.users insert → create profiles row`) instead of doing it in app code? Cleaner. Recommend yes — adds ~10 lines to 0001_init.sql.
2. **Email confirmation on signup?** Currently Supabase default sends a confirmation email before login works. Original Directus flow logged users in immediately. Recommend: set `email_confirm: true` in `signUp()` (shown in Stage 5) to preserve current UX.
3. **`forgot-password` flow**: client-side or server-side? Recommend client-side (`supabase.auth.resetPasswordForEmail` from a SvelteKit form action). Means deleting the two API routes.
4. **Multi-shop switching:** the `select-shop` endpoint and `shelf-current-shop` cookie stay the same. Just need to verify `getActiveMembership` handles a user with memberships in multiple shops correctly. Currently picks first; should be "first, or the cookie hint if present." Implementation as planned.

---

## Execution Order

```
Stage 0  Pre-flight (manual)              — ~10 min
Stage 1  supabase init + link             — ~5 min
Stage 2  schema migration                 — ~20 min
Stage 3  RLS policies                     — ~15 min
Stage 4  server clients + db types        — ~10 min
Stage 5  auth + hooks rewrite             — ~30 min
Stage 6  routes (one collection at a time) — ~3-4 hours
Stage 6a atomic functions                 — ~30 min
Stage 7  storage buckets                  — ~15 min
Stage 8  remove directus from infra       — ~30 min
Stage 9  keepalive                        — ~5 min
Stage 10 smoke tests                      — ~30 min
```

Total: roughly a full focused day. **Pause after each stage for review.**