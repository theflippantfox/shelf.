# Offline-First PWA Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to execute this plan task-by-task.

**Goal:** Make the app fully functional offline. Products, categories, and the cart work without a network. Sales made offline queue locally and replay when the network returns. The user sees clear status (online / offline / pending sync) and never loses data.

**Architecture:**
- **IndexedDB via `idb`** as the local store. Read-through cache for products/categories. Pending-write queue for sales.
- **Service worker** handles the static shell + runtime caching as today (vite config already has this). New: intercept writes to the SW-backed Background Sync queue, persist to IndexedDB, and retry on `online` event.
- **Sync status store** (`offlineQueue.svelte.ts`) is the source of truth for "what's pending". Components subscribe to it to show sync badges.
- **Conflict resolution**: server is authoritative on reads. On sale replay, the server validates stock and rejects if insufficient — that response is surfaced to the user as a "this sale couldn't sync" toast with the failure reason.

**Tech Stack:**
- `idb` (~3KB) — IndexedDB wrapper with Promise API
- Existing `@vite-pwa/sveltekit` for SW + background sync
- Existing `OfflineIndicator.svelte` for the online/offline pill
- Existing `cart.svelte.ts` (no changes — cart stays in memory; we sync on submit)
- `currentShop` + Supabase RLS for auth/identity

---

## Current state (verified)

- `@vite-pwa/sveltekit@1.1.0` is configured (`vite.config.ts` lines 6-65)
- Service worker is registered manually in `app.html` lines 22-29
- `OfflineIndicator.svelte` reads `navigator.onLine` and shows a gold pill when offline
- Background sync queues `shelf-api-get-queue` and `shelf-api-write-queue` are declared in vite config but not actually used by any client code yet
- `manifest.webmanifest` and icons (`icon-192.png`, `icon-512.png`, etc.) are in `static/`
- No IndexedDB code exists today — confirmed by `grep -r "idb\|indexeddb" src/`
- `cart.svelte.ts` is in-memory only — `cart.items` resets to `[]` on reload
- `svelte-check` baseline: 18 errors / 20 warnings (1 pre-existing `on:input` legacy in `restocking/orders/[id]/receive/+page.svelte` + 18 baseline)

---

## Task 1: Add `idb` dependency

**Objective:** Pull `idb` for typed IndexedDB access.

**Files:**
- Modify: `package.json` (one new dep)

**Step 1: Install**

```bash
cd ~/Projects/shelf && pnpm add idb
```

Expected: `+ idb ^8.0.0` in dependencies.

**Step 2: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "feat(deps): add idb for offline IndexedDB store"
```

---

## Task 2: `offlineDb.ts` — IndexedDB schema

**Objective:** Define the three stores the offline plan needs:
1. `products` — read-through cache of the products list (keyed by id)
2. `pending_sales` — queue of sales to replay (keyed by client-generated uuid)
3. `meta` — small kv store for "last sync at" timestamps

**Files:**
- Create: `src/lib/offline/offlineDb.ts`
- Test: `scripts/test-offline-db.mjs` (run via Node, no test framework)

**Step 1: Write the schema module**

```ts
// src/lib/offline/offlineDb.ts
import { openDB, type IDBPDatabase, type DBSchema } from 'idb';

export interface CachedProduct {
  id: string;
  shop_id: string;
  name: string;
  sku: string;
  description: string | null;
  category_id: string | null;
  price: number;
  cost_price: number;
  qty: number;
  unit: string;
  image_url: string | null;
  barcode: string | null;
  low_stock_threshold: number;
  archived_at: string | null;
  category: { id: string; name: string; color: string; icon: string } | null;
  // Local copy fields:
  _cached_at: number;     // Date.now() when this row was last fetched
}

export interface PendingSale {
  id: string;             // client-generated uuid
  shop_id: string;
  created_at: number;     // Date.now() when user submitted
  payload: {
    items: Array<{ product_id: string; name: string; sku: string; qty: number; unit_price: number }>;
    customer_id: string | null;
    customer_name: string | null;
    discount_type: 'amount' | 'percent' | null;
    discount_value: number;
    payment_method: 'cash' | 'credit' | 'transfer';
    notes: string | null;
    subtotal: number;
    discount_amount: number;
    total: number;
    tax_amount: number;
  };
  status: 'pending' | 'syncing' | 'failed' | 'synced';
  last_error: string | null;
  attempts: number;
}

interface ShelfDB extends DBSchema {
  products: {
    key: string;             // product.id
    value: CachedProduct;
    indexes: { 'by-updated': number };
  };
  pending_sales: {
    key: string;             // pending sale id
    value: PendingSale;
    indexes: { 'by-created': number };
  };
  meta: {
    key: string;             // 'lastProductsSync', 'lastSaleSync', etc.
    value: { at: number };
  };
}

let _db: Promise<IDBPDatabase<ShelfDB>> | null = null;

export function getDb(): Promise<IDBPDatabase<ShelfDB>> {
  if (_db) return _db;
  _db = openDB<ShelfDB>('shelf', 1, {
    upgrade(db) {
      const products = db.createObjectStore('products', { keyPath: 'id' });
      products.createIndex('by-updated', '_cached_at');

      const sales = db.createObjectStore('pending_sales', { keyPath: 'id' });
      sales.createIndex('by-created', 'created_at');

      db.createObjectStore('meta', { keyPath: 'key' as any });
      // meta uses string keys; idb's type-safe wrapper wants a keyPath
      // but the value holds the actual key string. Use a sentinel
      // keyPath and store the real key in the value.
    },
  });
  return _db;
}
```

**Step 2: Write a smoke test** (no framework — just node + a manual `indexeddb` polyfill via `fake-indexeddb` is overkill, run against real `node` which has IndexedDB via `node-indexeddb` or just check the schema via `tsc --noEmit`)

Actually: `idb` requires a browser. Skip the unit test, verify by running svelte-check (compiles), and verify the schema via a tiny browser-based test in a later task.

**Step 3: Run svelte-check**

```bash
npx svelte-check --tsconfig ./tsconfig.json 2>&1 | tail -3
```
Expected: 18 / 20 (baseline).

**Step 4: Commit**

```bash
git add src/lib/offline/offlineDb.ts
git commit -m "feat(offline): IndexedDB schema for products + pending sales"
```

---

## Task 3: `offlineSync.ts` — sync engine

**Objective:** Single module that owns "are we online", "are there pending sales", and the flush loop. Components subscribe via a Svelte store.

**Files:**
- Create: `src/lib/offline/offlineSync.svelte.ts`
- Modify: `src/lib/components/ui/OfflineIndicator.svelte` (consume the store, drop the standalone navigator.onLine listener)

**Step 1: Write the store**

```ts
// src/lib/offline/offlineSync.svelte.ts
import { browser } from '$app/environment';
import { getDb } from './offlineDb';

let _online       = $state(browser ? navigator.onLine : true);
let _pendingCount = $state(0);
let _syncing      = $state(false);
let _lastSyncAt   = $state<number | null>(null);
let _lastError    = $state<string | null>(null);

async function refreshPendingCount() {
  if (!browser) return;
  const db = await getDb();
  _pendingCount = await db.count('pending_sales');
}

async function refreshLastSync() {
  if (!browser) return;
  const db = await getDb();
  const row = await db.get('meta', 'lastFullSync');
  _lastSyncAt = row?.at ?? null;
}

/**
 * Flush the pending_sales queue.  For each row in `status === 'pending'`,
 * POST to /api/sales (the sale endpoint) and on success delete the row.
 * On failure, increment `attempts` and store the error message — the row
 * stays in the queue for the next attempt.
 *
 * Designed to be called:
 *   - on `online` event (immediate flush)
 *   - on app boot (if the queue has rows)
 *   - on user action (manual "Sync now" button if we add one)
 */
async function flushPendingSales(): Promise<void> {
  if (!browser || !_online || _syncing) return;
  const db = await getDb();
  const rows = await db.getAllFromIndex('pending_sales', 'by-created');
  if (rows.length === 0) return;

  _syncing = true;
  try {
    for (const row of rows) {
      if (row.status === 'synced') continue;
      await db.put('pending_sales', { ...row, status: 'syncing' });
      try {
        const res = await fetch('/api/sales', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...row.payload, client_id: row.id }),
        });
        if (res.ok) {
          await db.delete('pending_sales', row.id);
        } else {
          const err = await res.json().catch(() => ({ error: res.statusText }));
          await db.put('pending_sales', {
            ...row,
            status: 'failed',
            last_error: err.error ?? `HTTP ${res.status}`,
            attempts: row.attempts + 1,
          });
        }
      } catch (e: any) {
        await db.put('pending_sales', {
          ...row,
          status: 'failed',
          last_error: e?.message ?? 'Network error',
          attempts: row.attempts + 1,
        });
        // Stop the loop on the first network error — we'll retry
        // when the next `online` event fires.
        break;
      }
    }
  } finally {
    _syncing = false;
    await refreshPendingCount();
  }
}

/**
 * Refresh the local products cache from /api/products.  Called on:
 *   - app boot (if online)
 *   - after any product mutation (the sale page calls this after a
 *     successful sale too, so a product that just went out of stock
 *     reflects immediately)
 *   - on `online` event if `lastFullSync` is more than 5 minutes old
 */
async function refreshProductsCache(): Promise<void> {
  if (!browser || !_online) return;
  try {
    const res = await fetch('/api/products?limit=500');
    if (!res.ok) return;
    const list = await res.json() as any[];
    const db = await getDb();
    const tx = db.transaction('products', 'readwrite');
    const now = Date.now();
    for (const p of list) {
      await tx.store.put({ ...p, _cached_at: now });
    }
    await tx.done;
    await db.put('meta', { key: 'lastFullSync', at: now } as any);
    _lastSyncAt = now;
  } catch {
    // Network blip — fine, we'll retry on next online event.
  }
}

export const offlineSync = {
  get online()       { return _online; },
  get pendingCount() { return _pendingCount; },
  get syncing()      { return _syncing; },
  get lastSyncAt()   { return _lastSyncAt; },
  get lastError()    { return _lastError; },
  refreshPendingCount,
  refreshLastSync,
  flushPendingSales,
  refreshProductsCache,
};

if (browser) {
  // Wire up the navigator.onLine listeners.  We replace the existing
  // listeners in OfflineIndicator.svelte — the store is now the
  // source of truth.
  const setOnline = () => { _online = true; void flushPendingSales(); void refreshProductsCache(); };
  const setOffline = () => { _online = false; };
  window.addEventListener('online',  setOnline);
  window.addEventListener('offline', setOffline);
  // Boot-time sync (browser only).
  void refreshPendingCount();
  void refreshLastSync();
  if (_online) void refreshProductsCache();
}
```

**Step 2: Refactor OfflineIndicator to consume the store**

The current `OfflineIndicator.svelte` has its own `navigator.onLine` listener and internal state. Switch it to read from `offlineSync.online` and drop the duplicated logic.

```svelte
<script lang="ts">
  import { offlineSync } from '$lib/offline/offlineSync.svelte';
  // (drop the onMount + addEventListener block)
  let justReconnected = $state(false);
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  $effect(() => {
    if (offlineSync.online) {
      justReconnected = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(() => (justReconnected = false), 3000);
    }
  });
</script>
```

**Step 3: Run svelte-check + commit**

```bash
npx svelte-check --tsconfig ./tsconfig.json 2>&1 | tail -3
git add src/lib/offline/offlineSync.svelte.ts src/lib/components/ui/OfflineIndicator.svelte
git commit -m "feat(offline): sync engine + OnlineIndicator consumes the store"
```

---

## Task 4: Wire the sale page to enqueue offline sales

**Objective:** When the user submits a sale while offline, persist the sale to IndexedDB and show a "Saved offline · will sync" toast instead of POSTing.

**Files:**
- Modify: `src/routes/(app)/sale/+page.svelte` — wrap the `submitSale` fetch in a try/online branch

**Step 1: The change**

Find `submitSale` (around line 126) and branch on `offlineSync.online`:

```ts
import { offlineSync } from '$lib/offline/offlineSync.svelte';
import { getDb } from '$lib/offline/offlineDb';

async function submitSale() {
  if (cart.isEmpty) return;
  submitting = true;
  try {
    const payload = { /* existing payload building */ };
    if (!offlineSync.online) {
      // Queue for later.  We use a client-generated uuid so the
      // server can de-dupe if the same offline sale somehow gets
      // POSTed twice (shouldn't, but the unique constraint on
      // sales.client_id protects us).
      const id = crypto.randomUUID();
      const db = await getDb();
      await db.put('pending_sales', {
        id,
        shop_id: (data as any).shopId ?? '',
        created_at: Date.now(),
        payload,
        status: 'pending',
        last_error: null,
        attempts: 0,
      });
      toasts.success('Sale saved offline — will sync when you\'re back online');
      cart.clear();
      discountStr = '';
      await offlineSync.refreshPendingCount();
      // Skip the receipt modal — there's no reference number yet.
      return;
    }
    // (existing online flow unchanged)
  } finally {
    submitting = false;
  }
}
```

**Step 2: Commit**

```bash
git add src/routes/(app)/sale/+page.svelte
git commit -m "feat(pos): queue sales offline when network is down"
```

---

## Task 5: Sync badge in the bottom nav / header

**Objective:** Show a small "X pending" badge somewhere persistent so the user knows there are unsynced sales. When zero, hide it.

**Files:**
- Modify: `src/lib/components/layout/Header.svelte` — add a small badge in the header (next to the theme toggle)
- Create: `src/lib/components/ui/SyncBadge.svelte` — the badge component

**Step 1: Create SyncBadge.svelte**

```svelte
<script lang="ts">
  import { offlineSync } from '$lib/offline/offlineSync.svelte';
  import { CloudOff, RefreshCw } from 'lucide-svelte';
</script>

{#if offlineSync.pendingCount > 0 || offlineSync.syncing}
  <button
    type="button"
    class="inline-flex items-center gap-1 px-2 h-7 rounded-full text-[11px] font-semibold tabular-nums
           {offlineSync.syncing
             ? 'bg-[var(--cobalt-dim)] text-[var(--cobalt)]'
             : 'bg-[var(--gold-dim)] text-[var(--gold-fg)]'}"
    onclick={() => offlineSync.flushPendingSales()}
    title="Click to sync now"
  >
    {#if offlineSync.syncing}
      <RefreshCw size={11} class="animate-spin" />
      Syncing…
    {:else}
      <CloudOff size={11} />
      {offlineSync.pendingCount} pending
    {/if}
  </button>
{/if}
```

**Step 2: Mount in Header.svelte next to the theme toggle**

Find the header's right-side button cluster (search button + theme toggle + avatar). Insert `<SyncBadge />` between them.

**Step 3: Verify the live updates**

Boot the dev server, open the site in a browser, watch the header. The badge should appear when pendingCount > 0. Clicking it should trigger a flush.

**Step 4: Commit**

```bash
git add src/lib/components/ui/SyncBadge.svelte src/lib/components/layout/Header.svelte
git commit -m "feat(sync): pending-sale badge in the header"
```

---

## Task 6: Boot-time cache warming

**Objective:** When the app loads, fetch the products list and cache it in IndexedDB so the sale page works offline on first launch (after a network blip). And on every cold start, refresh the cache if it's more than 5 minutes old.

**Files:**
- Modify: `src/routes/(app)/+layout.svelte` — call `offlineSync.refreshProductsCache()` and `offlineSync.flushPendingSales()` in the existing `$effect.pre`

**Step 1: The change**

Add to the `$effect.pre` block (next to the existing `theme.init(...)` call):

```ts
import { offlineSync } from '$lib/offline/offlineSync.svelte';
// ...
$effect.pre(() => {
  auth.init(data.user as any, data.shopMember as any);
  currentShop.init(data.currentShop as any);
  // ...
  // Kick off the offline sync in the browser only.  Both calls
  // are no-ops when offline (the store checks navigator.onLine).
  offlineSync.refreshProductsCache();
  offlineSync.flushPendingSales();
});
```

**Step 2: Commit**

```bash
git add src/routes/(app)/+layout.svelte
git commit -m "feat(offline): warm products cache + flush queue on app boot"
```

---

## Task 7: Service worker — proxy sales to IndexedDB when offline

**Objective:** When the service worker is active and the user is offline, the SW intercepts POSTs to `/api/sales` and instead routes them to the IndexedDB queue. This is the "Background Sync" pattern that `@vite-pwa/sveltekit` is already configured for.

**Files:**
- Modify: `vite.config.ts` — add a custom `workbox.runtimeCaching` rule that calls `offlineQueue.push` (a SW-side function) instead of background-sync
- Create: `src/service-worker.ts` — custom SW that registers the offline queue handler

**Wait — `@vite-pwa/sveltekit` uses `strategies: 'generateSW'`** which means it generates the SW for me. To add custom logic, I need to switch to `strategies: 'injectManifest'` and write my own `src/service-worker.ts`. This is a bigger switch.

**Revised plan for this task:**

1. Switch `strategies: 'generateSW'` → `'injectManifest'`
2. Write `src/service-worker.ts` that:
   - Pre-caches the SvelteKit shell (via Workbox's `precacheAndRoute(self.__WB_MANIFEST)`)
   - Runtime-caches Google Fonts and `/_app/immutable/*` as before
   - On `/api/sales` POST: if the user is online, let it through; if offline, write to IndexedDB and return a 202 Accepted with `{ status: 'queued', client_id }` so the client knows the request was queued (and the page's `submitSale` doesn't need to handle this case — the service worker is the source of truth)
3. Listen for `sync` events with tag `flush-sales` and replay the queue

**Step 1: Switch to injectManifest**

In `vite.config.ts`:
```ts
strategies: 'injectManifest',
srcDir: 'src',
filename: 'service-worker.ts',
```

**Step 2: Write `src/service-worker.ts`**

```ts
/// <reference lib="webworker" />
/// <reference types="@sveltejs/kit" />

import { precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { CacheFirst, NetworkOnly } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { openDB } from 'idb';

declare const self: ServiceWorkerGlobalScope;

const SHELF_DB = 'shelf';
const SHELF_DB_VERSION = 1;

interface PendingSaleSW {
  id: string;
  url: string;
  body: string;             // serialized JSON
  headers: Record<string, string>;
  created_at: number;
}

async function getSwDb() {
  return openDB(SHELF_DB, SHELF_DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('sw-queue')) {
        db.createObjectStore('sw-queue', { keyPath: 'id' });
      }
    },
  });
}

precacheAndRoute(self.__WB_MANIFEST);

// Google Fonts: cache first
registerRoute(
  ({ url }) => /^https:\/\/fonts\.(googleapis|gstatic)\.com\//i.test(url.href),
  new CacheFirst({
    cacheName: 'google-fonts',
    plugins: [new ExpirationPlugin({ maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 })],
  }),
);

// SvelteKit immutable assets
registerRoute(
  ({ url }) => url.pathname.startsWith('/_app/immutable/'),
  new CacheFirst({ cacheName: 'sveltekit-immutable' }),
);

// /api/sales POST → if offline, queue; if online, passthrough
self.addEventListener('fetch', (event: any) => {
  const req: Request = event.request;
  if (req.method !== 'POST') return;
  const url = new URL(req.url);
  if (url.pathname !== '/api/sales') return;

  event.respondWith(handleSalePost(req));
});

async function handleSalePost(req: Request): Promise<Response> {
  if (navigator.onLine) {
    return fetch(req.clone());
  }
  // Offline path: queue and return 202.
  const id = crypto.randomUUID();
  const body = await req.clone().text();
  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => { headers[k] = v; });
  const db = await getSwDb();
  await db.put('sw-queue', {
    id, url: req.url, body, headers, created_at: Date.now(),
  } satisfies PendingSaleSW);
  // Best-effort: ask the SW to register a sync.
  // Falls back to a flush on the next `online` event.
  try {
    const reg = await self.registration;
    await (reg as any).sync?.register('flush-sales');
  } catch {}
  return new Response(JSON.stringify({ status: 'queued', client_id: id }), {
    status: 202,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Background Sync: replay the queue.
self.addEventListener('sync', (event: any) => {
  if (event.tag !== 'flush-sales') return;
  event.waitUntil(flushSaleQueue());
});

async function flushSaleQueue(): Promise<void> {
  const db = await getSwDb();
  const all = await db.getAll('sw-queue');
  for (const row of (all as PendingSaleSW[]).sort((a, b) => a.created_at - b.created_at)) {
    try {
      const res = await fetch(row.url, {
        method: 'POST',
        headers: row.headers,
        body: row.body,
      });
      if (res.ok) {
        await db.delete('sw-queue', row.id);
      } else {
        // Server error — keep the row; try again on next sync.
        return;
      }
    } catch {
      // Still offline — stop and try again on the next event.
      return;
    }
  }
}

// Manual flush trigger (e.g. from the page's "Sync now" button via
// postMessage, or from an `online` event the SW observes).
self.addEventListener('message', (event) => {
  if (event.data?.type === 'flush-sales') {
    event.waitUntil(flushSaleQueue());
  }
});
```

**Step 3: Verify the build still works**

```bash
npx vite build 2>&1 | tail -10
```
Expected: build succeeds; `build/sw.js` is the new injected SW.

**Step 4: Commit**

```bash
git add vite.config.ts src/service-worker.ts
git commit -m "feat(sw): custom SW with offline POST queue for /api/sales"
```

---

## Task 8: Final review and documentation

**Objective:** Update the README with the offline behavior, ensure svelte-check is clean, commit.

**Files:**
- Modify: `README.md` — add a short "Offline mode" section

**Step 1: Update README**

Add after the existing "Stack" section:

```markdown
## Offline mode

The app is offline-first. On first load (online), the products list is
cached in IndexedDB. After that:

- **Browsing** works offline — the sale page, inventory list, dashboard,
  history all load from the cache.
- **Sales made offline** are queued in IndexedDB and POSTed to the
  server automatically when the network returns. A small badge in the
  header shows the count of pending sales; click to retry.
- **Conflict resolution**: the server is authoritative. If a sale fails
  to sync (e.g. stock changed on the server), the user gets a toast
  with the failure reason and the row is marked failed in the queue.
```

**Step 2: Run svelte-check + commit**

```bash
npx svelte-check --tsconfig ./tsconfig.json 2>&1 | tail -3
git add README.md
git commit -m "docs: offline-mode section in README"
```

---

## Files likely to change (summary)

- New: `src/lib/offline/offlineDb.ts`
- New: `src/lib/offline/offlineSync.svelte.ts`
- New: `src/lib/components/ui/SyncBadge.svelte`
- New: `src/service-worker.ts`
- Modified: `package.json` + `pnpm-lock.yaml` (idb, workbox-precaching, workbox-routing, workbox-strategies, workbox-expiration)
- Modified: `vite.config.ts` (switch to injectManifest)
- Modified: `src/lib/components/ui/OfflineIndicator.svelte` (consume store)
- Modified: `src/lib/components/layout/Header.svelte` (mount SyncBadge)
- Modified: `src/routes/(app)/+layout.svelte` (boot-time cache warm)
- Modified: `src/routes/(app)/sale/+page.svelte` (offline branch in submitSale)
- Modified: `README.md`

## Tests / validation

- `svelte-check` stays at 18/20 baseline throughout.
- `npx vite build` succeeds; `build/sw.js` is generated with the new logic.
- Manual test: open /sale, turn off network (DevTools → Network → Offline), submit a sale, see "Saved offline" toast + the pending badge. Turn network back on, click the badge, watch the row get POSTed and the badge disappear.

## Risks, tradeoffs, and open questions

1. **SW SW is complex.** The custom `src/service-worker.ts` is the largest piece of new code. The "register `sync` event with tag `flush-sales`" path requires the browser to support the Background Sync API, which Chromium does and Safari does not. The `online` event listener on `self` is the fallback for Safari — we listen on the page side already, but the SW needs its own if it ever tries to flush without a page (e.g. the user closed the tab, comes back, and the queue has rows — actually, the SW can't run code without a page being open, so the page-side `online` listener is the canonical trigger). Document this.

2. **Two IndexedDB databases.** The page-side store (`shelf`, version 1) and the SW-side store (`shelf`, version 1, with `sw-queue` object store) are separate because the SW can't access the page's DB. We can't unify them without making the SW carry all the page's IndexedDB code (and then versioning is hell). This is the standard pattern.

3. **Sale "reference number" UX.** Today's online flow shows a receipt modal with the server-assigned reference. Offline sales can't show that — we show a "Saved offline" toast and skip the receipt. When the queue flushes and the sale succeeds, we should show a "Sale X-Y-Z synced" toast. That's a polish task for later, not in this plan.

4. **Conflict resolution is hard.** We're not solving it in this plan — we surface server errors as toasts. The "right" answer is probably operational transforms on the cart line items, but that's a research project. The current approach (server validates, client shows errors) is correct for a single-user POS.

5. **What if the user closes the tab while pending sales are in the SW queue?** The SW has the data, the page is gone. The next time the user opens the app, the page-side boot in Task 6 fetches the products cache; it doesn't fetch the SW queue. We need the page to also read from `sw-queue` on boot. Defer this to a follow-up; the `navigator.serviceWorker.controller?.postMessage({ type: 'flush-sales' })` pattern from the page can drain the queue on next boot.

6. **Service worker updates.** `registerType: 'autoUpdate'` is already set, so the SW updates on next page load. The user might lose pending sales during the update if the new SW's DB version differs. Mitigate by NOT incrementing the DB version in this plan, so the existing SW's data is preserved.

7. **No tests for the SW.** Service workers don't have a great test story in this repo. We verify by `vite build` succeeding and manual testing. If we add SW tests later, use `workbox-routing`'s `setDefaultHandler` in a test harness with a fake `fetch`.
