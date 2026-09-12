# Shëlf — Project Overview

Multi-tenant, mobile-first Point-of-Sale and retail management platform.

## Tech Stack

| Layer | Technology |
| ------- | ----------- |
| Frontend | SvelteKit 2 + Svelte 5 (runes), Tailwind CSS v4, Lucide icons |
| Backend | Supabase — Postgres 15, RLS, Auth, Storage |
| Auth | Supabase Auth (httpOnly cookies, magic-link / password) |
| Offline | IndexedDB (Dexie) + service worker cache + pending ops queue |
| Realtime | Supabase Realtime WebSocket subscriptions |
| Charts | Chart.js with custom HTML tooltips |
| Deploy | Vercel (adapter-vercel) against managed Supabase |

## Architecture

### Data Flow

```text
Server +layout.server.ts → layout $effect.pre hydrates stores
    ↓
Page $effect re-seeds from stores
    ↓
Optimistic mutations → stores update immediately → server writes
    ↓
Server response reconciles real data back into stores
    ↓
Realtime broadcasts cross-device sync
```

### Stores (Svelte 5 runes-based)

All stores live in `src/lib/stores/*.svelte.ts` and use `$state` runes:

| Store | Purpose |
| ------- | --------- |
| `cart.svelte.ts` | Cart items, payment splits, discount, round-off, finalTotal |
| `inventory.svelte.ts` | Products list, search, filtering |
| `customers.svelte.ts` | Customer list, search |
| `register.svelte.ts` | Cash register state, counter balance, today's entries |
| `sales.svelte.ts` | Sales history |
| `returns.svelte.ts` | Return records |
| `shop.svelte.ts` | Current shop settings |
| `auth.svelte.ts` | Current user session |
| `theme.svelte.ts` | Theme palette, dark mode |
| `toast.svelte.ts` | Toast notifications |

### Offline Layer

Located in `src/lib/offline/`:

| File | Purpose |
| ------ | --------- |
| `offlineDb.ts` | Dexie IndexedDB schema (v5) — 9 object stores |
| `offlineFetch.ts` | Smart fetch: queues writes when offline, reads from cache |
| `offlineSync.svelte.ts` | Pending ops queue, flush with retry/backoff |
| `realtime.ts` | Supabase Realtime WebSocket subscription manager |
| `cacheFirst.ts` | Cache-first fetch helpers |

**IndexedDB Stores:** `products`, `categories`, `customers`, `register`, `sale_items`, `pending_sales`, `pending_ops`, `meta`, `analytics_cache`

### Route Structure

```text
src/routes/
├── (app)/                    # Authenticated layout
│   ├── +layout.server.ts     # Loads shop, user, categories
│   ├── +layout.svelte        # Hydrates stores, realtime subscriptions
│   ├── +page.svelte          # Dashboard
│   ├── analytics/            # KPI dashboard with charts
│   ├── cash-register/        # EOD close, register history
│   ├── customers/            # Customer management
│   ├── history/              # Sales history
│   ├── inventory/            # Product management
│   ├── restocking/           # Suppliers, purchase orders
│   ├── sale/                 # POS + sale detail
│   └── settings/             # Shop, locale, appearance, taxes, receipt, team
├── api/                      # Server-side API routes
│   ├── analytics/
│   ├── cash-register/
│   ├── customers/
│   ├── products/
│   ├── sales/
│   └── settings/
├── onboarding/               # 7-step setup wizard
└── auth/                     # Login, signup, callback
```

## Key Patterns

### Optimistic Updates

All mutations update stores immediately, then hit the server. After server response, real data reconciles back. `invalidateAll()` is called to refresh server-loaded data.

### Split Payments

The POS supports Cash, UPI, and Credit as always-visible payment inputs. Sum of splits is hard-capped at `finalTotal` (grandTotal + roundOff). Each input handler clamps values so the total never exceeds the cap.

### Cash Register

Tracks opening balance, sales, credit payments, returns, and adjustments. EOD close shows expected vs physical count with shortage/overage.

### Realtime Sync

WebSocket subscriptions on `sales`, `sale_items`, `customers`, `products`, `categories`, and `cash_register_entries` tables keep stores in sync across devices.

## Known Limitations

- **Svelte LSP false positives**: Methods on classes in `.svelte.ts` rune files and properties added to inline object literals are not resolved by the LSP. Use `tsc --noEmit` to verify real TypeScript safety.
- **Supabase RPC TS**: `supabase.rpc()` calls infer `never` types in some cases — also a false positive confirmed by `tsc --noEmit`.
- **PWA service worker**: `vite-plugin-pwa` build fails with `ENOENT` for `service-worker.js` — unrelated to application code.

## Commands

```bash
pnpm dev          # Start dev server
pnpm build        # Production build
pnpm check        # Svelte type-check
pnpm type-check   # TypeScript check (tsc --noEmit)
```
