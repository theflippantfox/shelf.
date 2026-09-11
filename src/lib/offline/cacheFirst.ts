/**
 * cacheFirst — cache-before-server data loading with background refresh.
 *
 * Read path:
 *   1. Read from IndexedDB
 *   2. If fresh (maxAge not exceeded), return immediately — zero network
 *   3. If stale (or missing), return stale data immediately + refresh in background
 *   4. If cache cold (empty) AND offline, throw so the page can show an error
 *   5. If cache cold and online, fetch fresh and populate cache
 *
 * Write path (optimisticWrite):
 *   1. Immediately write to IndexedDB cache (optimistic)
 *   2. Fire server request in background
 *   3. On failure: mark in cache so next read knows to refresh
 *
 * Usage in +page.ts (not +page.server.ts):
 *   const data = await cacheFirst('products', () => fetch('/api/products').then(r => r.json()));
 */

import { browser } from "$app/environment";
import { getDb } from "./offlineDb";
import { offlineSync } from "./offlineSync.svelte";

export interface CacheOptions {
 /** Max age in ms before a cache entry is considered stale. Default: 5 minutes. */
 maxAge?: number;
 /** If true, always refresh in background even if cache is fresh. Default: false. */
 alwaysRefresh?: boolean;
 /** Human label for debug logs. Default: store name. */
 label?: string;
}

/**
 * Read the current shop id from the cookie so cache keys are shop-scoped.
 * Falls back to 'default' if no cookie is set (same pattern as cart store).
 */
export function getShopKey(): string {
 if (typeof document === "undefined") return "default";
 const match = document.cookie.match(/(?:^|;\s*)shelf-current-shop=([^;]+)/);
 return match ? decodeURIComponent(match[1]) : "default";
}

const DEFAULT_MAX_AGE = 5 * 60 * 1000; // 5 minutes

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Read from IndexedDB. Returns the parsed value or null if absent/error.
 */
async function readCache<T>(storeName: string, key: string): Promise<T | null> {
 if (!browser) return null;
 try {
  const db = await getDb();
  const row = await (db as any).get(storeName, key);
  return row?.value ?? null;
 } catch {
  return null;
 }
}

/**
 * Write a value to IndexedDB with a `cachedAt` timestamp.
 */
async function writeCache<T>(
 storeName: string,
 key: string,
 value: T,
 cachedAt: number = Date.now(),
): Promise<void> {
 if (!browser) return;
 try {
  const db = await getDb();
  await (db as any).put(storeName, { key, value, cachedAt });
 } catch {
  // IndexedDB write failure — non-fatal, continue without caching
 }
}

/**
 * Delete a specific cache key.
 */
async function deleteCache(storeName: string, key: string): Promise<void> {
 if (!browser) return;
 try {
  const db = await getDb();
  await (db as any).delete(storeName, key);
 } catch {
  /* non-fatal */
 }
}

/**
 * Delete all entries in a store.
 */
async function clearCache(storeName: string): Promise<void> {
 if (!browser) return;
 try {
  const db = await getDb();
  await (db as any).clear(storeName);
 } catch {
  /* non-fatal */
 }
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Core cache-first loader. Reads from IndexedDB first, falls back to the
 * network, and updates the cache in the background.
 *
 * @param storeName  IndexedDB object store (e.g. 'products', 'sale_items')
 * @param key        Cache key within the store (e.g. 'list', 'page_1')
 * @param fetcher    Network fetch function — called when cache is cold, stale,
 *                   or when alwaysRefresh is true
 * @param options    maxAge, alwaysRefresh, label
 *
 * @returns          { data, fromCache }
 *   data:       The result (cached or fresh)
 *   fromCache:  true if data came from cache, false if from network
 *   refreshing:  true if a background refresh was triggered (data is stale)
 */
export async function cacheFirst<T>(
 storeName: string,
 key: string,
 fetcher: () => Promise<T>,
 options: CacheOptions = {},
): Promise<{ data: T; fromCache: boolean; refreshing: boolean }> {
 if (!browser) {
  // SSR — no IndexedDB, just fetch
  const data = await fetcher();
  return { data, fromCache: false, refreshing: false };
 }

 const {
  maxAge = DEFAULT_MAX_AGE,
  alwaysRefresh = false,
  label = storeName,
 } = options;
 const now = Date.now();

 // 1. Read from cache
 const cached = await readCache<{ value: T; cachedAt: number }>(storeName, key);

 if (cached) {
  const age = now - cached.cachedAt;
  const isFresh = age < maxAge;

  if (!alwaysRefresh && isFresh) {
   // Cache is fresh — return immediately, no network call
   return { data: cached.value, fromCache: true, refreshing: false };
  }

  // Cache is stale OR alwaysRefresh requested — return stale data immediately,
  // refresh in background
  if (offlineSync.online) {
   refreshInBackground(storeName, key, fetcher);
  }

  return {
   data: cached.value,
   fromCache: true,
   refreshing: !isFresh, // only set refreshing=true if we triggered a background fetch
  };
 }

 // 2. Cache cold — fetch fresh from network
 if (offlineSync.online) {
  try {
   const data = await fetcher();
   await writeCache(storeName, key, data);
   return { data, fromCache: false, refreshing: false };
  } catch (err) {
   // Network fetch failed and cache is cold — surface the error so
   // the page can show a meaningful error state
   throw new Error(
    `Cache cold and network fetch failed for ${label}: ${(err as Error).message}`,
   );
  }
 }

 // 3. Offline + cold cache — nothing to show
 throw new Error(`Offline and no cached data for ${label}`);
}

/**
 * Fire a background refresh. Does NOT await — runs fire-and-forget.
 * On failure, the stale cache stays in IndexedDB with its original cachedAt.
 */
function refreshInBackground<T>(
 storeName: string,
 key: string,
 fetcher: () => Promise<T>,
): void {
 fetcher()
  .then(async (data) => {
   await writeCache(storeName, key, data);
  })
  .catch(() => {
   // Silently ignore background refresh failures.
   // The stale cache is still in IndexedDB for the next read.
  });
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Write data to cache immediately, then sync to server in background.
 * Used for writes: optimistic update first, server follows.
 *
 * @param storeName   IndexedDB store to write to
 * @param key         Cache key
 * @param value       New value to write (the optimistic update)
 * @param syncFn      Background sync function — returns a promise
 * @param options     onSyncFailure: called with the error if sync fails
 *
 * @returns { written, syncing }
 *   written:  true if the cache write succeeded
 *   syncing:  true if the sync is in-flight (will resolve/reject async)
 */
export async function optimisticWrite<T>(
 storeName: string,
 key: string,
 value: T,
 syncFn: () => Promise<void>,
 options: { onSyncFailure?: (err: Error) => void } = {},
): Promise<{ written: boolean; syncing: boolean }> {
 // 1. Write to cache immediately (optimistic)
 await writeCache(storeName, key, value);

 if (!offlineSync.online) {
  // Offline — enqueue for later sync (the sync engine handles this)
  // The write is already in cache, so reads will see the optimistic update
  return { written: true, syncing: false };
 }

 // 2. Sync in background
 syncFn()
  .then(async () => {
   // Success — cache is already up to date from the write above
  })
  .catch(async (err: Error) => {
   // Failure — mark cache entry as stale so next read forces a refresh
   options.onSyncFailure?.(err);
   // Invalidate the cache entry so the next read fetches fresh data from server
   await deleteCache(storeName, key);
  });

 return { written: true, syncing: true };
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Invalidate a cache entry, forcing the next cacheFirst() call to
 * refetch from the network.
 */
export async function invalidateCache(
 storeName: string,
 key?: string,
): Promise<void> {
 if (!browser) return;
 if (key) {
  await deleteCache(storeName, key);
 } else {
  await clearCache(storeName);
 }
}

/**
 * Destroy ALL IndexedDB object stores and known localStorage keys.
 * Called on logout so the next user on this device starts clean.
 */
export async function destroyAllData(): Promise<void> {
 if (!browser) return;
 // 1. Wipe every object store inside the shelf IndexedDB
 try {
  const db = await getDb();
  const storeNames = Array.from(
   { length: db.objectStoreNames.length },
   (_, i) => db.objectStoreNames[i],
  );
  const tx = db.transaction(storeNames, "readwrite");
  await Promise.all([
   ...storeNames.map((name) => tx.objectStore(name).clear()),
   tx.done,
  ]);
 } catch {
  /* IndexedDB unavailable — non-fatal */
 }

 // 2. Wipe known localStorage keys (theme, held carts, etc.)
 try {
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
   const k = localStorage.key(i);
   if (k && (k.startsWith("shelf-") || k.startsWith("theme"))) {
    keysToRemove.push(k);
   }
  }
  keysToRemove.forEach((k) => localStorage.removeItem(k));
 } catch {
  /* localStorage unavailable — non-fatal */
 }
}

/**
 * Read from cache without triggering a background refresh.
 * Use for SSR hydration where you already have server data.
 */
export async function readFromCache<T>(
 storeName: string,
 key: string,
): Promise<T | null> {
 return readCache<T>(storeName, key);
}

// ─────────────────────────────────────────────────────────────────────────────

export const cache = {
 read: readCache,
 write: writeCache,
 delete: deleteCache,
 clear: clearCache,
 invalidate: invalidateCache,
 readFromCache,
};
