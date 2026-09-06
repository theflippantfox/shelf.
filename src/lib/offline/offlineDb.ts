/**
 * IndexedDB schema for the offline-first PWA.
 *
 * Object stores
 * ─────────────
 * 1. `products`        — read-through cache of the products list
 * 2. `pending_sales`   — legacy queue for sales created while offline.
 *                        Preserved for backward compat with v1 entries
 *                        that haven't been flushed yet.
 * 3. `pending_ops`     — generic mutation queue (kind + method + path +
 *                        body). Replaces `pending_sales` for new writes
 *                        and covers products / customers / cash-register
 *                        / credit-payments / returns / share-toggle.
 * 4. `meta`            — small kv store for "last sync at" timestamps.
 * 5. `cached_*`        — read-through caches keyed by entity id
 *                        (categories, customers, register). These are
 *                        written by every server fetch and read on
 *                        offline page loads.
 *
 * Why a separate "sw-queue" object store lives in the service worker
 * (see service-worker.ts): service workers can't access the page's
 * IndexedDB. They live in separate execution contexts and the browser
 * keeps their storage isolated. This DB is the page-side view; the
 * SW has its own.
 *
 * Schema versioning: bumping the version triggers `upgrade()` which
 * can add indexes or object stores. Data in old stores is preserved
 * unless we explicitly clear it.
 */
import { openDB, type IDBPDatabase, type DBSchema } from 'idb';

/* ──────────────────────────────────────────────────────────────────
 * Cached entities (read-through cache)
 * ──────────────────────────────────────────────────────────────── */

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
  _cached_at: number;     // Date.now() when this row was last fetched
}

export interface CachedCategory {
  id: string;
  shop_id: string;
  name: string;
  color: string;
  icon: string;
  archived_at: string | null;
  _cached_at: number;
}

export interface CachedCustomer {
  id: string;
  shop_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  outstanding_balance: number;
  _cached_at: number;
}

export interface CachedRegisterEntry {
  id: string;
  shop_id: string;
  destination: string;
  amount: number;
  entry_type: string;
  source: string;
  sale_id: string | null;
  voided_entry_id: string | null;
  transfer_group_id: string | null;
  notes: string | null;
  created_at: string;
  created_by: string | null;
  voided_at: string | null;
  void_reason: string | null;
  _cached_at: number;
}

/* ──────────────────────────────────────────────────────────────────
 * Pending operations (mutation queue)
 * ──────────────────────────────────────────────────────────────── */

/**
 * PendingSale is the legacy v1 sales queue. We keep reading it from
 * the v1 schema (so any in-flight v1 sales still flush) but new sales
 * go through pending_ops with `kind: 'sale'`.
 */
export interface PendingSale {
  id: string;             // client-generated uuid (crypto.randomUUID)
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

/**
 * Generic mutation queue item. One row per logical write.
 *
 * When the sync engine flushes, it reconstructs an HTTP request:
 *   - method: 'POST' | 'PATCH' | 'DELETE'
 *   - path:   the API path (e.g. '/api/products', '/api/sales/abc/credit-payment')
 *   - body:   the JSON body for POST/PATCH (undefined for DELETE)
 *   - headers: optional extra headers (e.g. Idempotency-Key)
 *
 * On success, the row is deleted. On failure, the row stays so the
 * next flush can retry (with backoff per `attempts`).
 *
 * `kind` is for grouping / display in the UI badge ("3 pending sales,
 * 1 pending product"). The path tells the engine which endpoint to hit.
 */
export interface PendingOp {
  id:              string;          // client-generated uuid
  kind:            'sale' | 'product' | 'customer' | 'supplier' | 'register' |
                   'credit_payment' | 'return' | 'share_toggle' | 'other';
  /** Lower = higher priority. Flush order: customer/supplier(1) → product/register(2) → sale(10) → credit_payment/return(11). */
  priority?:        number;
  method:          'POST' | 'PATCH' | 'DELETE';
  path:            string;          // e.g. '/api/products' or '/api/sales/abc/credit-payment'
  body?:           any;             // JSON body for POST/PATCH
  headers?:        Record<string, string>;
  created_at:      number;          // Date.now()
  attempts:        number;          // how many times we've tried
  next_retry_at:   number;          // when we can try again (Date.now() or 0 = ready)
  last_error:      string | null;   // last failure reason
  last_status:     number | null;   // last HTTP status
  permanent:       boolean;         // true for 4xx (don't retry)
}

export interface MetaEntry {
  key: string;
  at: number;
}

interface ShelfDB extends DBSchema {
  products: {
    key: string;             // product.id
    value: CachedProduct;
    indexes: { 'by-updated': number };
  };
  categories: {
    key: string;             // category.id
    value: CachedCategory;
  };
  customers: {
    key: string;             // customer.id
    value: CachedCustomer;
  };
  register: {
    key: string;             // entry.id
    value: CachedRegisterEntry;
    indexes: { 'by-created': string };  // ISO date string
  };
  pending_sales: {
    key: string;             // pending sale id (uuid)
    value: PendingSale;
    indexes: { 'by-created': number };
  };
  pending_ops: {
    key: string;             // pending op id (uuid)
    value: PendingOp;
    indexes: {
      'by-next-retry': number;   // when it can be retried
      'by-created': number;      // FIFO order
      'by-priority': number;    // priority order (lower = first)
    };
  };
  meta: {
    key: string;             // sentinel keyPath (always 'meta' in practice)
    value: MetaEntry;
  };
}

const DB_NAME = 'shelf';
const DB_VERSION = 3;

let _db: Promise<IDBPDatabase<ShelfDB>> | null = null;

/**
 * Singleton accessor.  Calling this on the server returns a never-resolving
 * promise; callers in the page code should `browser`-guard before calling
 * (or let the promise hang harmlessly — no IndexedDB access happens).
 */
export function getDb(): Promise<IDBPDatabase<ShelfDB>> {
  if (typeof indexedDB === 'undefined') {
    return new Promise(() => {}) as any;  // SSR — never resolves
  }
  if (_db) return _db;
  _db = openDB<ShelfDB>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        const products = db.createObjectStore('products', { keyPath: 'id' });
        products.createIndex('by-updated', '_cached_at');

        const sales = db.createObjectStore('pending_sales', { keyPath: 'id' });
        sales.createIndex('by-created', 'created_at');

        db.createObjectStore('meta', { keyPath: 'key' });
      }
      if (oldVersion < 2) {
        // New v2 stores for the generic pending-ops queue and the
        // read-through caches for categories, customers, register.
        db.createObjectStore('categories', { keyPath: 'id' });

        db.createObjectStore('customers', { keyPath: 'id' });

        const register = db.createObjectStore('register', { keyPath: 'id' });
        register.createIndex('by-created', 'created_at');

        const pendingOps = db.createObjectStore('pending_ops', { keyPath: 'id' });
        pendingOps.createIndex('by-next-retry', 'next_retry_at');
        pendingOps.createIndex('by-created',  'created_at');
      }
      // Future versions add new stores / indexes here.
    },
  });
  return _db;
}

/** Helper for the meta store — fetches a single entry by its real key. */
export async function getMeta(db: IDBPDatabase<ShelfDB>, key: string): Promise<MetaEntry | undefined> {
  return db.get('meta', key);
}

export async function setMeta(db: IDBPDatabase<ShelfDB>, entry: MetaEntry): Promise<void> {
  await db.put('meta', entry);
}
