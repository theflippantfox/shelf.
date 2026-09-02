# Shëlf

Multi-tenant, mobile-first Point-of-Sale and retail management platform.

Built with **SvelteKit 2 · Svelte 5 runes · Tailwind CSS v4 · Supabase (Postgres + Auth + Storage + RLS) · TypeScript · Lucide icons**.

---

## Features

| Module          | What it does                                                                                          |
|-----------------|-------------------------------------------------------------------------------------------------------|
| **Dashboard**   | KPI strip (revenue, profit, transactions, alerts) + secondary stats (basket, customers, stock value) |
| **POS / Sale**  | Full-screen product grid, cart sheet, discount, tax, customer picker, receipt modal                  |
| **Inventory**   | CRUD products, low-stock filter, SKU search, category filter                                          |
| **Customers**   | Add/edit/delete, tier badges, visit count, total spent                                                |
| **Restocking**  | Suppliers, purchase orders, atomic receive function (Postgres `security definer`)                     |
| **Sales History** | Paginated list, sale detail, void with stock restore                                                |
| **Analytics**   | Revenue/profit trend, payment methods, top products, by-category, weekday×hour heatmap, period deltas |
| **Settings**    | Shop details · locale · appearance (palette + dark mode) · taxes · receipt · categories · team       |
| **Onboarding**  | 7-step wizard: account → shop → locale → appearance → team → categories → complete                    |
| **Command bar** | `⌘K` palette: page nav, product search, theme toggle, logout                                         |

---

## Stack

- **Frontend**: SvelteKit 2 + Svelte 5 (runes throughout), Tailwind CSS v4 (Vite plugin), Lucide icons
- **Backend**: [Supabase](https://supabase.com) — Postgres 15, Row Level Security, Auth, Storage
- **Auth**: Supabase Auth (httpOnly cookies, auto-refresh, magic-link / password)
- **Multi-tenancy**: `shops` + `shop_members` tables; shop selected per session
- **Charts**: chart.js engine with custom HTML tooltips and brand chrome
- **Deploy**: Docker Compose (SvelteKit app + Nginx + DuckDNS) against a managed Supabase project

---

## Quick Start

### 1. Prerequisites

- Node 20+
- Docker (for local Supabase: `npx supabase start` runs Postgres, GoTrue, PostgREST, Storage in containers)
- For production: a Supabase project (free tier is fine)

### 2. Clone and install

```bash
git clone <repo-url> shelf
cd shelf
npm install
```

### 3. Configure environment

```bash
cp .env.example .env
```

For local dev, `.env.example` already points at `http://127.0.0.1:54321`. After `npx supabase start`, copy the `anon key` and `service_role key` from the printed status table into `.env`.

For production, set:

```
PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service role key>
```

### 4. Apply the database schema

```bash
npm run db:reset        # applies all migrations in supabase/migrations/
npm run db:types        # regenerates src/lib/types/db.ts from the live schema
```

Migrations:

- `0001_init.sql` — 16 tables + auth/profile triggers
- `0002_rls_policies.sql` — Row Level Security with `is_shop_member` / `is_shop_owner` helpers
- `0003_functions_create_sale.sql` — atomic `create_sale(...)` (security definer, snapshots cost at sale time)
- `0004_functions_receive_purchase_order.sql` — atomic purchase-order receive
- `0005_storage_buckets.sql` — 3 private buckets (product images, avatars, bills)
- `0006_snapshot_cost_at_sale.sql` — adds `cost_at_sale` column to `sale_items`, backfilled
- `0007_palette_id.sql` — adds `palette_id` to `shops`

### 5. Run the dev server

```bash
npm run dev
```

Open <http://localhost:5173> — you'll be redirected through the onboarding wizard.

### 6. Build for production

```bash
npm run build
node build/index.js          # or use the Dockerfile below
```

---

## Project Layout

```
src/
├── app.css                     # Design system: tokens + component classes
├── app.html                    # HTML shell with anti-FOUC script
├── hooks.server.ts             # Auth middleware, shop context, cookie name
├── lib/
│   ├── analytics.ts            # All analytics builders (revenue, profit, margin, …)
│   ├── components/
│   │   ├── layout/             # Sidebar, BottomNav, Header (breadcrumb), PageShell
│   │   ├── ui/                 # Button, Card, KpiCard, StatTile, Sheet, …
│   │   ├── charts/             # Bar, Area, HBar, Donut, Sparkline, Heatmap
│   │   └── CommandBar.svelte   # ⌘K palette
│   ├── config/                 # app, nav, palettes, permissions, currencies, timezones, …
│   ├── server/                 # supabase clients, auth, storage
│   ├── stores/                 # auth, shop, cart, theme, toast, inventory, customers
│   ├── types/db.ts             # Generated Supabase types (regen with `npm run db:types`)
│   └── utils/                  # format, sku, analytics, colorUtils
└── routes/
    ├── (app)/                  # Authenticated app
    │   ├── +layout.{server,svelte}    # SSR currency init, theme init
    │   ├── +page.{server,svelte}      # Dashboard
    │   ├── analytics/  customers/  history/  inventory/
    │   ├── restocking/    (orders, suppliers, receive)
    │   ├── sale/                  # POS
    │   └── settings/              # 7 sub-pages
    ├── (auth)/                  # login, signup, forgot-password
    ├── onboarding/              # 7-step wizard
    ├── welcome/
    └── api/                     # SvelteKit API routes (auth, products, customers, sales, …)

supabase/
├── migrations/                 # 7 SQL migrations (see Quick Start)
└── config.toml                 # Local Supabase config

scripts/
├── supabase-keepalive.sh       # Pings the local stack so it doesn't pause
├── test-onboarding.sh          # 8-step end-to-end registration + onboarding
├── test-product-create.sh
├── test-history-detail.sh
├── test-dashboard-profit.sh    # Verifies profit = revenue − cogs (snapshot)
├── test-analytics.sh           # Verifies margin snapshot
├── test-analytics-page.sh      # Verifies snapshot survives product cost change
├── test-charts.sh              # Verifies analytics charts render
├── test-full-flow.sh
├── fix-supabase-client.py
├── fix-page-server.py
├── fix-null-coalesce.py
├── lift-settings*.py           # Header/padding refactor scripts
├── lift-headers*.py
├── strip-*.py
└── page-shell-to-div.py
```

---

## Money Handling

All monetary values are stored and passed in the codebase as **integer minor units** (e.g. ₹25.99 → `2599`).

- DB columns are `numeric(10,2)` but the application treats them as cents/paise.
- `formatCurrency(minorUnits)` in `src/lib/utils/format.ts` uses `Intl.NumberFormat` with the shop's active locale.
- `formatCurrencyCompact(minorUnits)` — compact form (₹1.5k, ₹12L, ₹1.2Cr) for KPI cards.
- `formatCurrencyMajor(major, {decimals})` — for chart axes where the data is already in major units (no /100 division).
- `getCurrencySymbol()` — returns the active shop's symbol (₹, $, €, etc.) for places that need the symbol but not full Intl formatting.

**Tax rate** is stored as **basis points** (e.g. 7.5% → `750`). Never use floating-point arithmetic for money — always stay in integers until display.

**Cost is snapshotted at sale time.** When `create_sale()` writes a `sale_items` row, it copies the product's current `cost_price` into the row's `cost_at_sale` column. Profit calculations always prefer `cost_at_sale ?? product.cost_price ?? 0` so historical profit is immune to later restock price changes.

**Default currency**: INR (Indian Rupee · ₹ · en-IN · Asia/Kolkata). Falls back to this when no shop data is loaded. Users can switch to any other currency in Settings → Locale.

---

## Design System

### Tokens

All tokens live in `src/app.css` (`:root` and `html.dark` variables) and mirror the per-palette token sets in `src/lib/config/palettes.ts`. The active palette is applied at runtime by `setPalette(id)` in `src/lib/stores/theme.svelte.ts` (which writes the token block to `:root` / `html.dark`).

Six curated palettes:

- `graphite-mint` (default) — neutral dark grey with mint accent
- `ink-gold` — ink black with warm gold
- `mist-violet` — soft grey with violet
- `ocean-cobalt` — deep navy with cobalt blue
- `forest-linen` — deep green on linen
- `rose-clay` — warm clay on rose

### Component primitives

- **Card** (`Card.svelte`) — base surface with gradient, inner highlight, layered shadow. Variants: default · elevated · inset · flat · gradient.
- **KpiCard** (`KpiCard.svelte`) — eyebrow label + display value + trend pill + icon + sub.
- **StatTile** (`StatTile.svelte`) — smaller companion to KpiCard for secondary stats.
- **NumberFlow** (`NumberFlow.svelte`) — animated counter using `requestAnimationFrame` with eased interpolation. Respects `prefers-reduced-motion`.
- **Sheet** (`Sheet.svelte`) — the one modal. Centered fly+fade on desktop with `backdrop-blur` overlay, drag-handle bottom-sheet on mobile. Use everywhere — `bind:open`, `title`, `description`, `maxWidth`, `children`, `footer` (snippet).

### Charts

`chart.js` engine with custom HTML tooltips, brand-tinted gridlines, gradient fills. See `src/lib/components/charts/`.

### Layout primitives

- **Sidebar** — desktop left nav (≥768px)
- **BottomNav** — mobile bottom nav with FAB for /sale
- **Header** — sticky top bar with breadcrumb (`Settings › Shop details`)

---

## Security

- Supabase Auth: httpOnly cookies, auto-refresh; cookie name `sb-<first-segment-of-API_URL-hostname>-auth-token`
- Two Supabase clients server-side: `adminClient()` (service-role, cross-shop) and `userClientFromCtx({ cookies })` (RLS-enforced, user scope)
- Postgres RLS policies in `0002_rls_policies.sql` gate every table by `is_shop_member(shop_id)` / `is_shop_owner(shop_id)`
- API handlers whitelist allowed fields; empty strings are coerced to `null` for nullable DB columns
- All money passed as integers; no floating-point arithmetic

---

## Deployment

Production runs as a Docker Compose stack (SvelteKit app + Nginx reverse proxy + DuckDNS updater) against a managed Supabase project. The Supabase backend is **not** in this compose file — it's a separate service you provision.

```bash
# 1. Build
docker compose build

# 2. Start (Nginx + app + DuckDNS updater)
docker compose up -d

# 3. Tail logs
docker compose logs -f shelf
```

Required env vars in `.env.production`:

- `PUBLIC_SUPABASE_URL`
- `PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `DUCKDNS_SUBDOMAIN`
- `DUCKDNS_TOKEN`

---

## Testing

End-to-end smoke tests live in `scripts/test-*.sh`. Each test registers a fresh user, runs onboarding, creates a product, rings a sale, and asserts the resulting dashboard/analytics state.

```bash
# Run all (in order)
bash scripts/test-onboarding.sh
bash scripts/test-product-create.sh
bash scripts/test-history-detail.sh
bash scripts/test-dashboard-profit.sh
bash scripts/test-analytics.sh
bash scripts/test-analytics-page.sh
bash scripts/test-charts.sh
bash scripts/test-full-flow.sh
```

The dev server must be running on `http://127.0.0.1:5180`.

---

## Roadmap

- [ ] Barcode scanner via camera (ZXing)
- [ ] Receipt printing (thermal printer via WebUSB)
- [ ] Multi-shop switcher
- [ ] CSV / PDF export for sales history
- [ ] Loyalty points system
- [ ] WhatsApp receipt sharing
- [ ] Offline-first with background sync

---

## License

MIT
