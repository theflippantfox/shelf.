/**
 * offlineSync — the page-side sync engine for the offline-first PWA.
 *
 * Owns:
 *   - Online/offline state (replaces the ad-hoc navigator.onLine
 *     listener that was in OfflineIndicator.svelte)
 *   - The pending count for the sync badge (sums pending_sales
 *     + pending_ops)
 *   - Boot-time warm of the read-through caches (products,
 *     categories, customers, register)
 *   - The flush loop: walks the pending_ops + pending_sales
 *     queues, replays each, retries with exponential backoff on
 *     network errors, marks permanent failure on 4xx.
 *
 * This is the page-side view. The service worker has a parallel
 * queue (`sw-queue` object store) that intercepts POSTs at the
 * network layer. Both flush on `online` — the SW via a `sync`
 * event (Chromium), the page via the `online` window event
 * (everyone). When the user reopens the app, this module's
 * flush functions are called on boot to drain anything the SW
 * left behind from a previous session.
 */

import { browser } from '$app/environment';
import {
  getDb,
  type PendingSale,
  type PendingOp,
  type CachedProduct,
  type CachedCategory,
  type CachedCustomer,
  type CachedRegisterEntry,
} from './offlineDb';
import { backoffMs } from './offlineFetch';

// Reactive state. These are module-level so every importer sees
// the same instance — Svelte 5's $state inside a .svelte.ts module
// works correctly when the module is a singleton.
let _online         = $state(browser ? navigator.onLine : true);
let _pendingCount   = $state(0);
let _pendingSales   = $state(0);
let _pendingOps     = $state(0);
let _syncing        = $state(false);
let _lastSyncAt     = $state<number | null>(null);
let _lastError      = $state<string | null>(null);
let _lastFlushAt    = $state<number | null>(null);
let _flushTimer     : ReturnType<typeof setTimeout> | null = null;

const FLUSH_INTERVAL_MS = 5_000;  // 5s — pick up ops whose retry timer expired

/* ──────────────────────────────────────────────────────────────────
 * State refresh
 * ──────────────────────────────────────────────────────────────── */

async function refreshPendingCount(): Promise<void> {
  if (!browser) return;
  try {
    const db = await getDb();
    const [sales, ops] = await Promise.all([
      db.count('pending_sales'),
      db.count('pending_ops'),
    ]);
    _pendingSales = sales;
    _pendingOps   = ops;
    _pendingCount = sales + ops;
  } catch {
    // IndexedDB unavailable (private mode, quota, etc.) — leave
    // the displayed count at whatever it was.
  }
}

async function refreshLastSync(): Promise<void> {
  if (!browser) return;
  try {
    const db = await getDb();
    const row = await db.get('meta', 'lastFullSync');
    _lastSyncAt = row?.at ?? null;
  } catch {}
}

/* ──────────────────────────────────────────────────────────────────
 * Generic pending_ops flush
 * ──────────────────────────────────────────────────────────────── */

/**
 * Walk the pending_ops queue and replay each one. Stops on the
 * first error so the order is preserved (we don't want a
 * later "delete customer X" to fire before an earlier
 * "create customer X" is still failing).
 *
 * Permanent errors (4xx other than 408/429) are marked and
 * skipped — the page UI can read the failure via `lastError` and
 * the user can decide whether to retry manually.
 */
async function flushPendingOps(): Promise<void> {
  if (!browser || !_online || _syncing) return;
  let db: Awaited<ReturnType<typeof getDb>>;
  try {
    db = await getDb();
  } catch { return; }

  let rows: PendingOp[];
  try {
    rows = await db.getAllFromIndex('pending_ops', 'by-created');
  } catch { return; }
  if (rows.length === 0) return;

  // Filter to ops that are ready to retry (next_retry_at has passed).
  const now = Date.now();
  const ready = rows.filter(r => !r.permanent && r.next_retry_at <= now);
  if (ready.length === 0) {
    // All pending ops are still in backoff — schedule a check.
    scheduleFlush(readyEarliest(rows));
    return;
  }

  _syncing = true;
  try {
    for (const row of ready) {
      if (row.permanent) continue;  // skip permanently-failed ops
      const result = await replayOp(row);
      if (result === 'network-error') {
        // Stop the loop — the next online event will resume.
        break;
      }
      if (result === 'recoverable-error') {
        // Mark with backoff. Don't break — a later op might still
        // be processable.
        await markOpWithBackoff(db, row, row.last_status ?? 0, row.last_error ?? '');
        continue;
      }
    }
    _lastFlushAt = Date.now();
  } finally {
    _syncing = false;
    await refreshPendingCount();
  }
}

type FlushResult = 'ok' | 'network-error' | 'recoverable-error' | 'permanent-error';

async function replayOp(op: PendingOp): Promise<FlushResult> {
  const db = await getDb();
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...op.headers,
    };
    const res = await fetch(op.path, {
      method: op.method,
      headers,
      body: op.body != null ? JSON.stringify(op.body) : undefined,
    });
    if (res.ok) {
      await db.delete('pending_ops', op.id);
      return 'ok';
    }
    // 4xx = permanent (the server is telling us the request is bad;
    //       retrying won't help). 408/429 = transient.
    if (res.status >= 400 && res.status < 500 &&
        res.status !== 408 && res.status !== 429) {
      const body = await res.json().catch(() => ({ error: res.statusText }));
      const err = body.error ?? body.message ?? `HTTP ${res.status}`;
      await db.put('pending_ops', {
        ...op,
        permanent:  true,
        last_error: err,
        last_status: res.status,
        attempts:   op.attempts + 1,
      });
      _lastError = `${op.method} ${op.path}: ${err}`;
      return 'permanent-error';
    }
    // 5xx (and 408/429): transient — apply backoff and try again later.
    const body = await res.json().catch(() => ({ error: res.statusText }));
    const err = body.error ?? body.message ?? `HTTP ${res.status}`;
    await db.put('pending_ops', {
      ...op,
      last_error:  err,
      last_status: res.status,
      attempts:    op.attempts + 1,
      next_retry_at: Date.now() + backoffMs(op.attempts),
    });
    _lastError = `${op.method} ${op.path}: ${err}`;
    return 'recoverable-error';
  } catch (e: any) {
    // Network blip — apply backoff.
    const err = e?.message ?? 'Network error';
    await db.put('pending_ops', {
      ...op,
      last_error:    err,
      last_status:   null,
      attempts:      op.attempts + 1,
      next_retry_at: Date.now() + backoffMs(op.attempts),
    });
    _lastError = `${op.method} ${op.path}: ${err}`;
    return 'network-error';
  }
}

async function markOpWithBackoff(
  db: Awaited<ReturnType<typeof getDb>>,
  op: PendingOp,
  status: number,
  err: string,
): Promise<void> {
  await db.put('pending_ops', {
    ...op,
    last_error:    err,
    last_status:   status || op.last_status,
    attempts:      op.attempts + 1,
    next_retry_at: Date.now() + backoffMs(op.attempts),
  });
}

function readyEarliest(rows: PendingOp[]): number | null {
  let earliest: number | null = null;
  for (const r of rows) {
    if (r.permanent) continue;
    if (earliest == null || r.next_retry_at < earliest) {
      earliest = r.next_retry_at;
    }
  }
  return earliest;
}

/**
 * Schedule the next flush to fire when the earliest queued op is
 * ready. Falls back to the regular interval if the queue is empty.
 */
function scheduleFlush(at: number | null): void {
  if (_flushTimer) clearTimeout(_flushTimer);
  if (!_online) return;
  const delay = at
    ? Math.max(0, at - Date.now())
    : FLUSH_INTERVAL_MS;
  _flushTimer = setTimeout(() => {
    void flushPendingOps();
  }, Math.min(delay, FLUSH_INTERVAL_MS));
}

/* ──────────────────────────────────────────────────────────────────
 * Legacy pending_sales flush
 * ──────────────────────────────────────────────────────────────── */

/**
 * Walk the pending_sales queue, POST each one, mark/delete.
 *
 * Stops on the first network error — we'll retry on the next
 * `online` event. Stops on the first non-OK HTTP response too,
 * since the server is telling us something specific (insufficient
 * stock, etc.) and we want the user to see the error before
 * continuing.
 */
async function flushPendingSales(): Promise<void> {
  if (!browser || !_online || _syncing) return;
  let db: Awaited<ReturnType<typeof getDb>>;
  try {
    db = await getDb();
  } catch { return; }

  let rows: PendingSale[];
  try {
    rows = await db.getAllFromIndex('pending_sales', 'by-created');
  } catch { return; }
  if (rows.length === 0) return;

  _syncing = true;
  try {
    for (const row of rows) {
      if (row.status === 'synced') continue;
      // Mark in-flight so the badge shows "Syncing…".
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
          // Server rejected (insufficient stock, validation, etc.).
          // Mark the row failed and stop the loop — let the user
          // see the error and decide what to do.
          const err = await res.json().catch(() => ({ error: res.statusText }));
          await db.put('pending_sales', {
            ...row,
            status: 'failed',
            last_error: err.error ?? `HTTP ${res.status}`,
            attempts: row.attempts + 1,
          });
          _lastError = err.error ?? `HTTP ${res.status}`;
          break;
        }
      } catch (e: any) {
        // Network blip — put the row back to pending, stop the
        // loop, wait for the next `online` event.
        await db.put('pending_sales', {
          ...row,
          status: 'pending',
          last_error: e?.message ?? 'Network error',
          attempts: row.attempts + 1,
        });
        break;
      }
    }
  } finally {
    _syncing = false;
    await refreshPendingCount();
  }
}

/* ──────────────────────────────────────────────────────────────────
 * Cache warmers
 * ──────────────────────────────────────────────────────────────── */

/**
 * Fetch the full products list and cache it in IndexedDB.  Called
 * on app boot (if online) and after any product mutation.  The
 * `limit=500` covers typical shop sizes; if a shop has more, the
 * /api/products route would need pagination (separate task).
 */
async function refreshProductsCache(): Promise<void> {
  if (!browser || !_online) return;
  try {
    const res = await fetch('/api/products?limit=500');
    if (!res.ok) return;
    const list = (await res.json()) as CachedProduct[];
    const db = await getDb();
    const tx = db.transaction('products', 'readwrite');
    const now = Date.now();
    for (const p of list) {
      await tx.store.put({ ...p, _cached_at: now });
    }
    await tx.done;
    await db.put('meta', { key: 'lastFullSync', at: now });
    _lastSyncAt = now;
  } catch {
    // Network blip — the existing cache is still good.  Try again
    // on the next online event.
  }
}

async function refreshCategoriesCache(): Promise<void> {
  if (!browser || !_online) return;
  try {
    const res = await fetch('/api/categories?limit=200');
    if (!res.ok) return;
    const list = (await res.json()) as CachedCategory[];
    const db = await getDb();
    const tx = db.transaction('categories', 'readwrite');
    const now = Date.now();
    for (const c of list) {
      await tx.store.put({ ...c, _cached_at: now });
    }
    await tx.done;
  } catch { /* non-fatal */ }
}

async function refreshCustomersCache(): Promise<void> {
  if (!browser || !_online) return;
  try {
    const res = await fetch('/api/customers?limit=500');
    if (!res.ok) return;
    const list = (await res.json()) as CachedCustomer[];
    const db = await getDb();
    const tx = db.transaction('customers', 'readwrite');
    const now = Date.now();
    for (const c of list) {
      await tx.store.put({ ...c, _cached_at: now });
    }
    await tx.done;
  } catch { /* non-fatal */ }
}

async function refreshRegisterCache(): Promise<void> {
  if (!browser || !_online) return;
  try {
    const res = await fetch('/api/cash-register?limit=200');
    if (!res.ok) return;
    const json = await res.json();
    const list = (Array.isArray(json) ? json : (json.entries ?? [])) as CachedRegisterEntry[];
    const db = await getDb();
    const tx = db.transaction('register', 'readwrite');
    const now = Date.now();
    for (const e of list) {
      await tx.store.put({ ...e, _cached_at: now });
    }
    await tx.done;
  } catch { /* non-fatal */ }
}

/**
 * Refresh all read-through caches. Called on app boot and on
 * every online transition. Each warmer is independent — if
 * /api/products is down, the customers cache still loads.
 */
async function refreshAllCaches(): Promise<void> {
  if (!browser || !_online) return;
  // Sequential to keep the network polite (and the server log readable).
  await refreshProductsCache();
  await refreshCategoriesCache();
  await refreshCustomersCache();
  await refreshRegisterCache();
}

/** Force a sync now. The user clicks "Sync now" in the header. */
async function syncNow(): Promise<void> {
  if (!browser) return;
  await flushPendingOps();
  await flushPendingSales();
  await refreshAllCaches();
}

/* ──────────────────────────────────────────────────────────────────
 * Public API
 * ──────────────────────────────────────────────────────────────── */

export const offlineSync = {
  get online()         { return _online; },
  get pendingCount()   { return _pendingCount; },
  get pendingSales()   { return _pendingSales; },
  get pendingOps()     { return _pendingOps; },
  get syncing()        { return _syncing; },
  get lastSyncAt()     { return _lastSyncAt; },
  get lastError()      { return _lastError; },
  get lastFlushAt()    { return _lastFlushAt; },
  refreshPendingCount,
  refreshLastSync,
  flushPendingOps,
  flushPendingSales,
  refreshProductsCache,
  refreshCategoriesCache,
  refreshCustomersCache,
  refreshRegisterCache,
  refreshAllCaches,
  syncNow,
};

// Boot wiring.  Only runs in the browser (the $state defaults are
// already correct for SSR).
if (browser) {
  // Flip online state on the window's online/offline events and
  // trigger the relevant follow-up.  Centralising this here means
  // OfflineIndicator.svelte doesn't need its own listener.
  const onOnline = () => {
    _online = true;
    void refreshAllCaches();
    void flushPendingOps();
    void flushPendingSales();
    // Ask the SW to drain its own queue too (if any rows were
    // queued by the SW's fetch handler — the page-side store
    // doesn't see those).
    navigator.serviceWorker?.controller?.postMessage({ type: 'flush-sales' });
  };
  const onOffline = () => {
    _online = false;
    if (_flushTimer) { clearTimeout(_flushTimer); _flushTimer = null; }
  };
  window.addEventListener('online',  onOnline);
  window.addEventListener('offline', onOffline);

  // Boot-time priming.  Both calls are no-ops when offline (they
  // short-circuit on _online).  We don't await — these run in the
  // background and update the reactive state when done.
  void refreshPendingCount();
  void refreshLastSync();
  if (offlineSync.online) {
    void refreshAllCaches();
    // Also ask the SW to drain anything it queued in a previous
    // session.
    navigator.serviceWorker?.ready?.then((reg) => {
      reg.active?.postMessage({ type: 'flush-sales' });
    }).catch(() => { /* SW not yet registered — fine */ });
  }

  // Periodic flush so ops whose retry timer has expired get a chance
  // to fire even if no `online` event arrives.
  setInterval(() => {
    if (_online && _pendingOps > 0) void flushPendingOps();
  }, FLUSH_INTERVAL_MS);
}
