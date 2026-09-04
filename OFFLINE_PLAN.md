# Offline-First PWA — Design Plan

## Goal
Every page reads from a reactive client-side store that is hydrated from
the server when online and from IndexedDB when offline. Every write goes
through an optimistic local update + a queue. The sync engine drains
the queue when online, with backoff on failure.

## Existing foundation
- `src/lib/offline/offlineDb.ts` — IndexedDB schema for products + pending_sales + meta
- `src/lib/offline/offlineSync.svelte.ts` — online/offline state + sales queue flush

## What's missing (and how to build it)

### 1. Expand IndexedDB schema
- v1 already has `products`, `pending_sales`, `meta`
- v2 adds:
  - `categories` (cached, read-through)
  - `customers` (cached, read-through)
  - `sales_cache` (cached, recent sales for history/analytics)
  - `register_cache` (cached, recent register entries)
  - `settings_cache` (cached, shop settings)
  - `pending_ops` (generic mutation queue — kind/method/body/target_id)

### 2. Reactive data stores (one per entity)
- `src/lib/stores/offline/products.svelte.ts`
- `src/lib/stores/offline/customers.svelte.ts`
- `src/lib/stores/offline/categories.svelte.ts`
- `src/lib/stores/offline/register.svelte.ts`
- Each store exposes:
  - reactive `$state` items array
  - `ensureLoaded()` — fetch from server, fall back to cache when offline
  - `createLocal()` / `updateLocal()` / `removeLocal()` — optimistic + enqueue
  - `reconcileLocalRow(client_id, realRow)` — called by sync on success

### 3. Sync engine rewrite
- `offlineSync.svelte.ts` extends to:
  - `enqueue(op)` — push to pending_ops, kick off flush if online
  - `flushPendingOps()` — walk the queue, POST/PATCH/DELETE
  - `flushPendingSales()` — existing sales queue (preserved for backward compat)
  - Exponential backoff: 5s, 15s, 1m, 5m, 30m (capped)
  - 4xx = permanent error, mark and stop
  - 5xx / network = transient, retry with backoff
  - Periodic retry interval (5s) for ops whose `next_retry_at` has passed

### 4. Endpoint resolution
- `endpointForOp(op)` — maps `{kind, method, target_id}` → URL
  - product POST  → /api/products
  - product PATCH → /api/products/{id}
  - customer POST → /api/customers
  - register POST  → /api/cash-register
  - credit-payment → /api/sales/{id}/credit-payment
  - void-sale      → /api/sales/{id}

### 5. UI integration
- Pages that READ from a list: keep the server `load` (it seeds the cache
  via `ensureLoaded`), then use the store for re-renders
- Pages that WRITE: call `store.createLocal(...)` instead of fetch;
  the sync engine handles the server POST
- New `OfflineBadge.svelte` component:
  - Shows online/offline indicator
  - Shows pending count with "Sync now" button
  - Shown in the Header

### 6. Page-by-page changes (priority order)
1. **Customers** — add offline store, page reads from it
2. **Categories** — same pattern
3. **Cash register** — entries create offline
4. **Products** (inventory) — already has the store skeleton
5. **History** — uses sales_cache, shows pending badge
6. **Analytics** — reads from cached sales

## Build issues encountered (and how to work around)

**`.svelte.ts` resolution**: Vite 8's `import-analysis` plugin doesn't
honor `resolve.extensions` for static imports. The current existing
files in the project (`auth.svelte.ts`, `cart.svelte.ts`, etc.) work
because SvelteKit's pre-processing handles them before the import-analysis
runs. The issue arises when a `.svelte.ts` file is imported from another
`.svelte.ts` file in a NEW subdirectory of `src/lib/offline/stores/`.

**Workaround options:**
1. **Use plain `.ts` files** for the new stores (not `.svelte.ts`). But
   then the `$state` runes won't work — they'd need to be wrapped in
   a class with `$state` in a constructor.
2. **Put the new stores alongside existing ones** in `src/lib/stores/`
   (not in a new subdirectory) — this works because SvelteKit's
   pre-processing path already covers that directory.
3. **Add the `.svelte.ts` extension to Vite's `resolve.extensions` AND
   `optimizeDeps.entries`** — this should work but needs more testing.

**Recommended path: option 2.** Move the new stores to
`src/lib/stores/products-offline.svelte.ts` etc., alongside the existing
ones. This avoids the resolution issue entirely.

## Implementation order (incremental, testable)

### Phase 1: Schema + sync engine
- Expand `offlineDb.ts` to v2 with the new stores
- Rewrite `offlineSync.svelte.ts` to enqueue + flush `pending_ops`
- Verify the existing sales queue still works (regression test)

### Phase 2: Products store
- Create `src/lib/stores/products-offline.svelte.ts` (alongside the
  existing stores, not in a new directory)
- Wire it up to the products page
- Verify online + offline flows

### Phase 3: Customers + Categories stores
- Same pattern as products
- Wire to customers + categories pages

### Phase 4: Register store
- The cash register has its own entry-creation flow
- Optimistic local entry + sync
- The main balance card stays server-authoritative (it's the source of
  truth for how much real money is in each drawer)

### Phase 5: Pages integration
- All pages that read lists of stuff use the stores
- All write forms use the local-creators
- Pending badges on the relevant pages
- The "Sync now" button in the Header

## What this plan does NOT do
- No service-worker-side queue (the existing SW only handles the
  precache; the page-side sync engine handles writes)
- No conflict resolution for concurrent edits on multiple devices
  (this is a single-user-single-device shop, so the last-writer-wins
  is acceptable)
- No offline-queue for file uploads (we have no file-upload API
  endpoints right now)
