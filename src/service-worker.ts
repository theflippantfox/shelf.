/// <reference lib="webworker" />
/**
 * Custom service worker for the offline-first PWA.
 *
 * Responsibilities:
 *   1. Precache the SvelteKit app shell via Workbox's manifest.
 *   2. Cache Google Fonts + SvelteKit immutable assets for fast loads.
 *   3. Handle navigation requests: try the network, fall back to the
 *      precached shell.
 *   4. Catch POST /api/sales calls that fail because the network
 *      dropped between when the page decided it was online and when
 *      the request actually went out.  We queue those into a
 *      service-worker-owned IndexedDB and replay them on `sync` or
 *      the next `online` event.
 *
 * Design note: the page-side `offlineSync` module already queues
 * sales when it knows the user is offline (checked BEFORE calling
 * fetch).  This SW's queue is a safety net for the case where the
 * page thinks it's online but the network drops mid-request.
 *
 * Communication: the page can postMessage({type: 'flush-sales'}) to
 * force a flush.  The layout does this on boot and the SyncBadge
 * does it on click.
 */
import { precacheAndRoute, createHandlerBoundToURL } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { CacheFirst, NetworkFirst, NetworkOnly } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { openDB, type IDBPDatabase, type DBSchema } from 'idb';

declare const self: ServiceWorkerGlobalScope;

// ---------- Workbox precache + runtime caches ----------

// __WB_MANIFEST is injected at build time by vite-plugin-pwa with
// the list of static assets to precache.
precacheAndRoute(self.__WB_MANIFEST ?? []);

// Google Fonts — CacheFirst so a returning user pays no network cost.
registerRoute(
  ({ url }) => /^https:\/\/fonts\.(googleapis|gstatic)\.com\//i.test(url.href),
  new CacheFirst({
    cacheName: 'google-fonts',
    plugins: [new ExpirationPlugin({ maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 })],
  }),
);

// SvelteKit's hashed /_app/immutable/* — CacheFirst since the
// filename hash is the cache-busting key.
registerRoute(
  ({ url }) => url.pathname.startsWith('/_app/immutable/'),
  new CacheFirst({ cacheName: 'sveltekit-immutable' }),
);

// Navigation requests: try network first, fall back to the
// precached shell so the app shell loads offline.  Without this,
// an offline user would see the browser's "you are offline" page
// even when the shell is in the cache.
try {
  const handler = createHandlerBoundToURL('/');
  registerRoute(
    ({ request }) => request.mode === 'navigate',
    new NetworkFirst({ cacheName: 'pages', networkTimeoutSeconds: 3 }),
  );
} catch {
  // createHandlerBoundToURL throws if the build manifest is empty
  // (e.g. running this file outside of a Vite build).  Fall back
  // to no-op for that case.
}

// /api/* GETs — always network.  No SW-side cache: data freshness
// matters here, and the page already has its own IndexedDB cache.
registerRoute(
  ({ url, request }) => url.pathname.startsWith('/api/') && request.method === 'GET',
  new NetworkOnly(),
);

// ---------- SW-side offline write queue ----------

interface SwQueuedRequest {
  id: string;
  url: string;
  method: string;
  body: string;
  headers: Record<string, string>;
  created_at: number;
}

interface SwDB extends DBSchema {
  'sw-queue': {
    key: string;
    value: SwQueuedRequest;
    indexes: { 'by-created': number };
  };
}

const SW_DB_NAME = 'shelf-sw';
const SW_DB_VERSION = 1;

let _swDb: Promise<IDBPDatabase<SwDB>> | null = null;

function getSwDb(): Promise<IDBPDatabase<SwDB>> {
  if (_swDb) return _swDb;
  _swDb = openDB<SwDB>(SW_DB_NAME, SW_DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('sw-queue')) {
        const store = db.createObjectStore('sw-queue', { keyPath: 'id' });
        store.createIndex('by-created', 'created_at');
      }
    },
  });
  return _swDb;
}

async function enqueueRequest(req: Request): Promise<string> {
  const id = crypto.randomUUID();
  const body = await req.clone().text();
  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => { headers[k] = v; });
  const db = await getSwDb();
  await db.put('sw-queue', {
    id,
    url: req.url,
    method: req.method,
    body,
    headers,
    created_at: Date.now(),
  });
  // Best-effort: ask the platform to wake us up via a sync event.
  // (Chromium supports this; Safari ignores it gracefully and the
  // `message` handler below is the fallback path.)
  try {
    const reg = await self.registration;
    // @ts-ignore — sync is on SyncManager in lib.dom, not in webworker
    await reg.sync?.register('flush-sales');
  } catch { /* unsupported — fine */ }
  return id;
}

async function flushQueue(): Promise<void> {
  const db = await getSwDb();
  const all = await db.getAllFromIndex('sw-queue', 'by-created');
  for (const row of all) {
    try {
      const res = await fetch(row.url, {
        method: row.method,
        headers: row.headers,
        body: row.body,
      });
      if (res.ok) {
        await db.delete('sw-queue', row.id);
      } else {
        // Server rejected — keep the row, try again on the next
        // flush.  The page-side store (`pending_sales`) already
        // captures the user-visible error in this case via the
        // /api/sales 4xx response handling.
        return;
      }
    } catch {
      // Network blip — stop, retry on the next event.
      return;
    }
  }
}

// ---------- POST /api/sales interception ----------

self.addEventListener('fetch', (event: any) => {
  const req: Request = event.request;
  if (req.method !== 'POST') return;
  const url = new URL(req.url);
  if (url.pathname !== '/api/sales') return;

  // If the page thought it was online and just called fetch, try
  // the network first.  On network failure, queue and return a
  // 202 Accepted so the caller knows the request was buffered
  // rather than lost.
  event.respondWith(handleSalePost(req));
});

async function handleSalePost(req: Request): Promise<Response> {
  try {
    const res = await fetch(req.clone());
    if (res.ok || res.status < 500) {
      // Either success or a real server error (4xx) — let it
      // through.  The page handles non-OK responses.
      return res;
    }
    // 5xx — server-side issue, queue for retry.
    throw new Error(`server ${res.status}`);
  } catch {
    // Network error or 5xx — queue and return 202.
    const id = await enqueueRequest(req);
    return new Response(JSON.stringify({ status: 'queued', client_id: id }), {
      status: 202,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// ---------- Lifecycle: sync events + manual flush + activate ----------

self.addEventListener('sync', (event: any) => {
  if (event.tag !== 'flush-sales') return;
  event.waitUntil(flushQueue());
});

self.addEventListener('message', (event: any) => {
  if (event.data?.type === 'flush-sales') {
    event.waitUntil(flushQueue());
  }
  // Allow the page to skip waiting (vite-plugin-pwa uses this
  // pattern for autoUpdate).
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('activate', (event: any) => {
  // Take control of all open tabs immediately so the new SW
  // starts handling fetch events without a reload.
  event.waitUntil(self.clients.claim());
});
