/**
 * offlineSync — the page-side sync engine for the offline-first PWA.
 *
 * Owns:
 *   - Online/offline state (replaces the ad-hoc navigator.onLine
 *     listener that was in OfflineIndicator.svelte)
 *   - The pending-sale count for the sync badge
 *   - Boot-time warm of the products cache from /api/products
 *   - The flush loop: walks the pending_sales queue, POSTs each
 *     one, deletes the row on success, marks failed on error.
 *
 * This is the page-side view.  The service worker has a parallel
 * queue (`sw-queue` object store) that intercepts POSTs at the
 * network layer.  Both flush on `online` — the SW via a `sync`
 * event (Chromium), the page via the `online` window event
 * (everyone).  When the user reopens the app, this module's
 * `flushPendingSales` is called on boot to drain anything the
 * SW left behind from a previous session.
 */

import { browser } from '$app/environment';
import { getDb, type PendingSale } from './offlineDb';

// Reactive state.  These are module-level so every importer sees
// the same instance — Svelte 5's $state inside a .svelte.ts module
// works correctly when the module is a singleton (which it is,
// thanks to ES modules).
let _online       = $state(browser ? navigator.onLine : true);
let _pendingCount = $state(0);
let _syncing      = $state(false);
let _lastSyncAt   = $state<number | null>(null);
let _lastError    = $state<string | null>(null);

/** Refresh the pending count from IndexedDB.  Cheap; safe to call often. */
async function refreshPendingCount(): Promise<void> {
  if (!browser) return;
  try {
    const db = await getDb();
    _pendingCount = await db.count('pending_sales');
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

/**
 * Walk the pending_sales queue, POST each one, mark/delete.
 *
 * Stops on the first network error — we'll retry on the next
 * `online` event.  Stops on the first non-OK HTTP response too,
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
    const list = (await res.json()) as any[];
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

// Boot wiring.  Only runs in the browser (the $state defaults are
// already correct for SSR).
if (browser) {
  // Flip online state on the window's online/offline events and
  // trigger the relevant follow-up.  Centralising this here means
  // OfflineIndicator.svelte doesn't need its own listener.
  const onOnline = () => {
    _online = true;
    void flushPendingSales();
    void refreshProductsCache();
    // Ask the SW to drain its own queue too (if any rows were
    // queued by the SW's fetch handler — the page-side store
    // doesn't see those).
    navigator.serviceWorker?.controller?.postMessage({ type: 'flush-sales' });
  };
  const onOffline = () => {
    _online = false;
  };
  window.addEventListener('online',  onOnline);
  window.addEventListener('offline', onOffline);

  // Boot-time priming.  Both calls are no-ops when offline (they
  // short-circuit on _online).  We don't await — these run in the
  // background and update the reactive state when done.
  void refreshPendingCount();
  void refreshLastSync();
  if (_online) {
    void refreshProductsCache();
    // Also ask the SW to drain anything it queued in a previous
    // session.
    navigator.serviceWorker?.ready?.then((reg) => {
      reg.active?.postMessage({ type: 'flush-sales' });
    }).catch(() => { /* SW not yet registered — fine */ });
  }
}
