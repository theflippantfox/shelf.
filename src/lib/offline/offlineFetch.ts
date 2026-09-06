/**
 * offlineFetch — the offline-aware network layer.
 *
 * The page code calls `offlineFetch(path, options)` instead of
 * `fetch(path, options)`. If the device is online, it's a thin
 * wrapper around `fetch` (returns the real response). If the device
 * is offline, the request is enqueued in IndexedDB and a synthetic
 * 202 Accepted response is returned so the page's optimistic UI
 * code keeps working.
 *
 * Why this design:
 *   - Pages don't need a separate "if offline, do this" branch.
 *   - The sync engine drains the queue when the network returns.
 *   - Errors are surfaced to the user through the same toast/error
 *     path as before (the page checks `res.ok` and toasts on failure).
 *   - We can offline-ify any endpoint with zero page-level changes.
 *
 * Idempotency: when enqueuing, the caller can pass an Idempotency-Key
 * header. The sync engine preserves it on retry so the server can
 * dedupe a retried POST against its own state.
 */

import { browser } from '$app/environment';
import { getDb, type PendingOp } from './offlineDb';
import { offlineSync } from './offlineSync.svelte';

export type OfflineFetchOptions = RequestInit & {
  /** Optional override — the kind for the pending_ops row (for grouping in the UI). */
  kind?: PendingOp['kind'];
  /**
   * If true, the call goes to the network even when offline. Default
   * false (we queue instead). Used for GETs (no point queueing
   * reads) and for "must hit the network" calls like logout.
   */
  forceOnline?: boolean;
};

/**
 * Smart fetch: queues writes when offline, fetches normally otherwise.
 * Reads (GET) fall back to the server cache when offline.
 */
export async function offlineFetch(
  input: string,
  options: OfflineFetchOptions = {},
): Promise<Response> {
  if (!browser) {
    // SSR — return a stub that won't crash but won't pretend to be real.
    return new Response(JSON.stringify({ error: 'No offline fetch in SSR' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  const method = (options.method ?? 'GET').toUpperCase();
  const isWrite = method === 'POST' || method === 'PATCH' || method === 'DELETE';

  // Online: just fetch.
  if (offlineSync.online || options.forceOnline) {
    return fetch(input, options);
  }

  // Offline + read: there's nothing useful to queue. Reject so the
  // caller's existing error path runs. The caller should fall back
  // to reading from the local store.
  if (!isWrite) {
    return new Response(JSON.stringify({ error: 'Offline — no cached data' }), {
      status: 503, headers: { 'Content-Type': 'application/json' },
    });
  }

  // Offline + write: enqueue and return synthetic 202 Accepted.
  // The optimistic update is already in the local store; the page
  // code treats a 2xx as success and moves on.
  try {
    const id = await enqueueOp({
      kind:    options.kind ?? 'other',
      method:  method as 'POST' | 'PATCH' | 'DELETE',
      path:    typeof input === 'string' ? input : (input as URL).toString(),
      body:    parseBody(options.body),
      headers: extractHeaders(options.headers),
    });
    return new Response(JSON.stringify({ ok: true, queued: id }), {
      status: 202,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? 'Queue failed' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}

function parseBody(body: any): any | undefined {
  if (body == null) return undefined;
  if (typeof body === 'string') {
    try { return JSON.parse(body); } catch { return body; }
  }
  return body;
}

function extractHeaders(h: HeadersInit | undefined): Record<string, string> {
  if (!h) return {};
  if (h instanceof Headers) {
    const out: Record<string, string> = {};
    h.forEach((v, k) => { out[k] = v; });
    return out;
  }
  if (Array.isArray(h)) {
    const out: Record<string, string> = {};
    for (const [k, v] of h) out[k] = v;
    return out;
  }
  return { ...h };
}

/**
 * Enqueue a write op. Returns the row id.
 *
 * Public because the sync engine reads/writes the same table — but
 * pages should always go through `offlineFetch` instead.
 */
export async function enqueueOp(input: {
  kind:    PendingOp['kind'];
  method:  'POST' | 'PATCH' | 'DELETE';
  path:    string;
  body?:   any;
  headers?: Record<string, string>;
  priority?: number;   // auto-computed if omitted
}): Promise<string> {
  const db = await getDb();
  const id = crypto.randomUUID();
  const row: PendingOp = {
    id,
    kind:    input.kind,
    priority: input.priority ?? computePriority(input.kind),
    method:  input.method,
    path:    input.path,
    body:    input.body,
    headers: input.headers,
    created_at:     Date.now(),
    attempts:       0,
    next_retry_at:  0,                // ready to flush immediately when online
    last_error:     null,
    last_status:    null,
    permanent:      false,
  };
  await db.put('pending_ops', row);
  // Wake the sync engine so it can flush right now if online.
  void offlineSync.flushPendingOps();
  return id;
}

/** Priority map: lower = processes first. */
const KIND_PRIORITY: Record<PendingOp['kind'], number> = {
  customer:      1,   // highest — new customers must exist before sales
  supplier:      1,   // same as customer
  product:       2,   // products needed for inventory accuracy
  register:      2,   // cash register ops
  sale:         10,   // sales last (customer already exists)
  credit_payment: 11,  // tied to an existing sale
  return:        11,  // tied to an existing sale
  share_toggle:  12,  // low urgency
  other:         99,  // catch-all
};

function computePriority(kind: PendingOp['kind']): number {
  return KIND_PRIORITY[kind] ?? 99;
}

/* ──────────────────────────────────────────────────────────────────
 * Backoff schedule
 * ──────────────────────────────────────────────────────────────── */

/**
 * Exponential backoff: 5s, 15s, 1m, 5m, 30m (capped).
 * Used for network errors / 5xx. 4xx errors are permanent and don't
 * retry (we mark the op and surface the error to the user).
 */
export function backoffMs(attempts: number): number {
  const schedule = [5_000, 15_000, 60_000, 300_000, 1_800_000];
  return schedule[Math.min(attempts, schedule.length - 1)];
}

/* ──────────────────────────────────────────────────────────────────
 * Read-through cache helpers
 * ──────────────────────────────────────────────────────────────── */

/**
 * Read cached entities of a given type, sorted however the caller
 * wants. Returns [] if the cache is empty (offline + never fetched).
 */
export async function readCache<T>(
  store: 'products' | 'categories' | 'customers' | 'register',
  sortBy?: keyof T,
): Promise<T[]> {
  try {
    const db = await getDb();
    const all = await db.getAll(store);
    if (sortBy) {
      return (all as T[]).sort((a, b) =>
        String((a as any)[sortBy] ?? '').localeCompare(String((b as any)[sortBy] ?? ''))
      );
    }
    return all as T[];
  } catch {
    return [];
  }
}

/**
 * Write a batch of entities to the cache. Replaces any existing
 * rows with the same primary key.
 */
export async function writeCache(
  store: 'products' | 'categories' | 'customers' | 'register',
  rows: any[],
): Promise<void> {
  try {
    const db = await getDb();
    const tx = db.transaction(store, 'readwrite');
    const now = Date.now();
    for (const r of rows) {
      await tx.store.put({ ...r, _cached_at: now });
    }
    await tx.done;
  } catch { /* non-fatal */ }
}

/**
 * Upsert a single entity into the cache.
 */
export async function upsertCache(
  store: 'products' | 'categories' | 'customers' | 'register',
  row: any,
): Promise<void> {
  try {
    const db = await getDb();
    await db.put(store, { ...row, _cached_at: Date.now() });
  } catch { /* non-fatal */ }
}

/**
 * Delete a single entity from the cache.
 */
export async function deleteFromCache(
  store: 'products' | 'categories' | 'customers' | 'register',
  id: string,
): Promise<void> {
  try {
    const db = await getDb();
    await db.delete(store, id);
  } catch { /* non-fatal */ }
}
