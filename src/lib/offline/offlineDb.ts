/**
 * IndexedDB schema for the offline-first PWA.
 *
 * Two stores the offline plan needs:
 *   1. `products`    — read-through cache of the products list
 *   2. `pending_sales` — queue of sales to replay when the network returns
 *   3. `meta`        — small kv store for "last sync at" timestamps
 *
 * Why a separate "sw-queue" object store lives in the service worker
 * (see service-worker.ts): service workers can't access the page's
 * IndexedDB.  They live in separate execution contexts and the
 * browser keeps their storage isolated.  This DB is the page-side
 * view; the SW has its own.
 *
 * Schema versioning: bumping the version triggers `upgrade()` which
 * can add indexes or object stores.  Data in old stores is preserved
 * unless we explicitly clear it.
 */
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
 * Meta entries are keyed by an arbitrary string in the `key` field
 * (we use 'lastFullSync', 'lastSaleFlush', etc.).  idb's type-safe
 * wrapper wants a keyPath on the object store, so we use a sentinel
 * (`key: string`) and store the real key in the value.
 */
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
  pending_sales: {
    key: string;             // pending sale id (uuid)
    value: PendingSale;
    indexes: { 'by-created': number };
  };
  meta: {
    key: string;             // sentinel keyPath (always 'meta' in practice)
    value: MetaEntry;
  };
}

const DB_NAME = 'shelf';
const DB_VERSION = 1;

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

        // meta uses a sentinel keyPath of 'meta' (always).  The real
        // identifier lives in the value's `key` field.
        db.createObjectStore('meta', { keyPath: 'key' });
      }
      // Future versions add new stores / indexes here.
    },
  });
  return _db;
}

/**
 * Helper for the meta store — fetches a single entry by its real key.
 * `db.get('meta', 'meta')` would always read the same row; this takes
 * the user-facing key.
 */
export async function getMeta(db: IDBPDatabase<ShelfDB>, key: string): Promise<MetaEntry | undefined> {
  return db.get('meta', key);
}

export async function setMeta(db: IDBPDatabase<ShelfDB>, entry: MetaEntry): Promise<void> {
  await db.put('meta', entry);
}
