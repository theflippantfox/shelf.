# Offline-First PWA — Status

**Status: ✅ Core implemented, shipped in `684fb19`.**

## Goal
Every page reads from a reactive client-side store that is hydrated from
the server when online and from IndexedDB when offline. Every write goes
through an optimistic local update + a queue. The sync engine drains
the queue when online, with backoff on failure.

## What's done

### 1. IndexedDB schema v2
- `products` — read-through cache (existed in v1)
- `categories`, `customers`, `register` — NEW read-through caches
- `pending_ops` — NEW generic mutation queue
- `pending_sales` — legacy queue (preserved for backward compat)
- `meta` — small kv store for sync timestamps

### 2. Generic pending_ops queue
- `offlineFetch(path, options)` — `fetch` wrapper that queues writes
  when offline, returns 202 to the caller. The page's existing
  `if (res.ok)` check is the only contract.
- `enqueueOp({kind, method, path, body, headers})` — public helper
  used by both the engine and pages.
- Per-op: id (UUID), kind, method, path, body, headers, attempts,
  next_retry_at, last_error, last_status, permanent.

### 3. Sync engine
- `flushPendingOps()` — walks the queue, replays each via fetch,
  applies exponential backoff (5s, 15s, 1m, 5m, 30m) on transient
  errors, marks 4xx (other than 408/429) as permanent.
- `flushPendingSales()` — legacy v1 sales queue.
- `refreshAllCaches()` — warms products, categories, customers,
  register from the server.
- `syncNow()` — user-triggered full sync (used by the "Sync now"
  button in the OfflineIndicator).
- 5s periodic flush picks up ops whose retry timer has expired.

### 4. Store hydration
- `inventory.svelte.ts` and `customers.svelte.ts` now have
  `hydrateFromCache()` methods that read from IDB.
- The layout's `$effect` calls `hydrateFromCache()` on every page
  mount. The server payload (from the same layout's `$effect.pre`)
  overlays IDB.
- The flow is: IDB shows first (instant, works offline) → server
  replaces → user makes a write (optimistic) → sync engine flushes
  the queue when online.

### 5. UI
- `OfflineIndicator.svelte` — three states:
  - offline (gold pill with pending count)
  - online-with-pending (cobalt "N pending · Sync now" button)
  - just-reconnected (brief teal "Back online")
- `/offline-test` — manual debug page (enqueue a test op, sync now,
  inspect the queue).

### 6. Page integrations (writes that work offline)
- `/sale` — sale creation, with "Pending sync" badge in the receipt
- `/cash-register` — manual entries, transfers, voids
- `/sale/[id]` — credit payments, returns

## What's still TODO

### Priority 1 — page coverage gaps
- `/inventory` — add product (POST /api/products) — page-level edit
  works but the create path is a `fetch` call, not `offlineFetch`
- `/customers` — add customer (POST /api/customers) — same gap
- `/restocking/orders/[id]` — receive delivery (PATCH) — same gap
- `/restocking/orders/[id]` — record payment (POST payments) —
  already considered, but page uses direct fetch
- `/categories` — create/edit categories

### Priority 2 — read-side cache coverage
- `/categories` page — only renders from server data, not the
  store. Add `categories.svelte.ts` store and hydrate from IDB
- `/restocking/*` pages — receive cached suppliers + products
  (mostly fine, they use direct fetches)

### Priority 3 — service-worker-side queue
- The service worker has its own `sw-queue` IndexedDB store
  (mentioned in the original plan). The page-side engine handles
  all current writes. The SW queue is for the case where the user
  submits a write and the page is closed before the page-side engine
  can flush. This isn't built yet but isn't blocking — the page-side
  `flushPendingSales` / `flushPendingOps` on the next page load
  handles the common case.

### Priority 4 — nicer "pending sales" UX
- The history page should show "pending" sales (with a clock icon)
  so the user knows they have unsynced sales in the queue
- Currently they're not shown — they only appear in the OfflineIndicator

### Priority 5 — server-side idempotency
- The server doesn't dedupe `client_id` yet for sales. The `Idempotency-Key`
  header is set by the page but the server doesn't read it.
- For a clean offline experience, the server should accept the
  client_id and treat duplicate POSTs with the same id as the
  same sale. Otherwise a user submitting offline + losing the
  response could create a duplicate when the sync engine retries
  the queue.
- The supplier payment endpoint already has this (client_request_id
  UNIQUE in the DB).

## How to test

See `/tmp/manual_offline_test.md` for the full procedure. Short
version: open DevTools → Network → Offline → make a sale →
expect "Pending sync" badge + the pill shows "1 pending" →
go back online → pill shows "1 pending · Sync now" → click it →
queue drains.

The `/offline-test` page is a faster way: open it, click "Enqueue
test op", see the row appear in the queue list, click "Sync now",
see it disappear.
