# Shëlf

> Multi-tenant, mobile-first Point-of-Sale and retail management platform.
> Built with **SvelteKit 5 + Svelte 5 Runes · Tailwind CSS v4 · Directus 11**.

---

## Features

| Module | What it does |
|---|---|
| **Dashboard** | Today's revenue, transaction count, quick actions, low-stock alerts, recent sales |
| **POS / Sale** | Full-screen product grid, cart sheet, discount, tax, customer picker, receipt modal |
| **Inventory** | CRUD products, restock, low-stock filter, SKU search, category filter |
| **Customers** | Add/edit/delete, VIP / Regular / New tier badges, visit count, total spent |
| **Sales History** | Paginated list, sale detail, void with stock restore |
| **Analytics** | Revenue chart (SVG), payment method breakdown, top products, by-category |
| **Settings** | Shop details, locale, appearance (palette/dark mode), taxes, receipt, categories, team |
| **Onboarding** | 7-step wizard: account → shop → locale → appearance → team → categories → complete |

---

## Stack

- **Frontend**: SvelteKit 2 + Svelte 5 (runes throughout), Tailwind CSS v4 (Vite plugin), Lucide icons
- **Backend**: [Directus 11](https://directus.io) (self-hosted, SQLite or Postgres)
- **Auth**: Directus built-in auth — httpOnly cookie tokens, auto-refresh
- **Multi-tenancy**: `shops` + `shop_members` tables; shop selected per session cookie

---

## Quick Start

### 1 — Prerequisites
- Node 20+
- A running **Directus 11** instance  
  Quickest way: `npx directus@latest init` or use Docker:
  ```bash
  docker run -p 8055:8055 \
    -e SECRET=your-secret-here \
    -e ADMIN_EMAIL=admin@example.com \
    -e ADMIN_PASSWORD=yourpassword \
    directus/directus:11
  ```

### 2 — Configure environment
```bash
cp .env.example .env.local
# Edit .env.local:
#   DIRECTUS_URL=http://localhost:8055
#   DIRECTUS_ADMIN_TOKEN=<token from Directus admin → Settings → API Tokens>
```

> **How to get an admin token**: Directus admin UI → Settings → API Tokens → Create token → copy it.

### 3 — Apply the database schema
```bash
npm run db:bootstrap
```
This calls the Directus schema API to create all 9 collections (`shops`, `shop_members`, `categories`, `products`, `customers`, `sales`, `sale_items`, `stock_log`, `tags`) without touching any existing data.

> **Important — set Directus permissions**: After bootstrap, go to  
> `Directus Admin → Settings → Access Policies`  
> and ensure your app's admin token has full CRUD on all Shëlf collections. The easiest approach is to use a token belonging to the Administrator role.

### 4 — Run the dev server
```bash
npm install
npm run dev
```
Open http://localhost:5173 — you'll be redirected to the onboarding wizard.

### 5 — Build for production
```bash
npm run build
node build/index.js
```

---

## Project Structure

```
src/
├── app.css                     # Design system (tokens, components, layout)
├── app.html                    # HTML shell with anti-FOUC script
├── hooks.server.ts             # Auth middleware, shop context
├── lib/
│   ├── config/                 # App config, permissions, palettes, icons, nav
│   ├── server/directus.ts      # Directus SDK client factory
│   ├── stores/                 # Svelte 5 rune-based stores (auth, shop, cart…)
│   ├── types/directus.ts       # TypeScript types for all collections
│   ├── utils/                  # format, tiers, permissions, colorUtils
│   └── components/
│       ├── layout/             # Sidebar, BottomNav, Header, PageShell
│       └── ui/                 # Button, Modal, Input, Toast, KpiCard, Avatar…
└── routes/
    ├── (app)/                  # All authenticated pages
    │   ├── +layout.{server,svelte}
    │   ├── +page.{server,svelte}   # Dashboard
    │   ├── sale/               # POS
    │   ├── inventory/
    │   ├── customers/
    │   ├── history/
    │   ├── analytics/
    │   └── settings/
    ├── (auth)/login/           # Login page
    ├── onboarding/             # 7-step wizard
    └── api/                    # SvelteKit API routes
        ├── auth/               # login, logout, register, select-shop, forgot-password
        ├── products/
        ├── customers/
        ├── sales/
        ├── categories/
        ├── analytics/
        ├── settings/
        ├── stock/
        └── users/

scripts/
├── schema.json                 # Directus schema snapshot — apply via db:bootstrap
└── bootstrap-directus.ts       # Setup script
```

---

## Money Handling

All monetary values are stored as **integer minor units** (e.g. $25.99 → `2599`).  
`formatCurrency(minorUnits)` in `src/lib/utils/format.ts` uses `Intl.NumberFormat` with the shop's locale.  
Tax rate is stored as **basis points** (e.g. 7.5% → `750`).  
Never use floating-point arithmetic for money — always stay in integers.

---

## Directus Permissions

Shëlf uses a single admin token server-side for all Directus operations.  
The app enforces its own RBAC (owner / manager / cashier + per-user overrides)  
through the `shop_members.permissions` JSON field and `src/lib/config/permissions.ts`.

> For production: create a dedicated non-administrator Directus role for Shëlf  
> with CRUD access only on the 9 Shëlf collections.

---

## Design Tokens

All tokens live in `src/app.css` (`:root` variables) and mirror `src/lib/config/tokens.ts`.  
The active palette is applied at runtime via `theme.applyShopPalette()` in `src/lib/stores/theme.svelte.ts`.  
Dark mode toggling uses the `html.dark` class + CSS `color-mix()` overrides.

---

## Roadmap (V2/V3 from the original spec)

- [ ] Barcode scanner via camera (ZXing)
- [ ] Receipt printing (thermal printer via WebUSB)
- [ ] Product image uploads (Directus Files API)
- [ ] Multi-shop switcher
- [ ] CSV / PDF export for sales history
- [ ] Loyalty points system
- [ ] WhatsApp receipt sharing
- [ ] Offline-first with background sync

---

## License

MIT
