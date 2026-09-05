/**
 * Inventory store — single source of truth for the product list across
 * the whole app. Svelte 5 runes-based, so any component that reads
 * `inventory.all` re-renders automatically when the array changes.
 *
 * The store is seeded from `data.products` (server `+page.server.ts`)
 * via `inventory.replaceAll(...)` from each page that needs it
 * (typically the layout). After that, all reads should come from
 * the store, not from `data.products`. Writes (`add`, `update`,
 * `remove`) happen optimistically — the UI updates immediately, and
 * the server is hit in the background. If the server fails, the
 * optimistic change is rolled back.
 *
 * The same store is used by:
 *   - /inventory      (list, KPI counts, filter chips)
 *   - /sale           (product picker)
 *   - /restocking/... (search for products to reorder)
 *   - dashboard low-stock section
 */

import { appConfig } from '$lib/config/app';

export type StockStatus = 'ok' | 'low' | 'out';

export function getStockStatus(product: any): StockStatus {
  // Products that have opted out of low-stock tracking are always 'ok'
  // for alert purposes. qty=0 still returns 'out' so the user can see
  // they're empty even if they don't count stock.
  if (product.track_stock === false) {
    return product.qty === 0 ? 'out' : 'ok';
  }
  if (product.qty === 0) return 'out';
  if (product.qty <= (product.low_stock_threshold ?? appConfig.inventory.defaultLowStockThreshold)) return 'low';
  return 'ok';
}

class InventoryStore {
  #items  = $state<any[]>([]);
  #search = $state('');
  #cat    = $state('');

  // ── Getters (reactive — re-render on read) ───────────────────────────
  get all()    { return this.#items; }
  get search() { return this.#search; }
  get category(){ return this.#cat; }

  get count()  { return this.#items.length; }

  get lowStock() {
    return this.#items.filter(p =>
      p.track_stock !== false &&
      p.qty > 0 &&
      p.qty <= (p.low_stock_threshold ?? appConfig.inventory.defaultLowStockThreshold)
    );
  }
  get outOfStock() {
    return this.#items.filter(p => p.qty === 0);
  }
  get inStock() {
    return this.#items.filter(p =>
      p.track_stock === false
        ? p.qty > 0
        : p.qty > (p.low_stock_threshold ?? appConfig.inventory.defaultLowStockThreshold)
    );
  }
  get alertCount() { return this.lowStock.length + this.outOfStock.length; }

  get filtered() {
    let list = this.#items.filter(p => !p.archived_at);
    if (this.#cat) {
      const c = this.#cat;
      list = list.filter(p => (p.category?.id ?? p.category) === c);
    }
    return list;
  }

  // ── Setup ───────────────────────────────────────────────────────────
  /** Seed the store from the server-rendered `data.products`. Idempotent. */
  init(items: any[]) {
    // Only seed when the store is empty so we don't wipe optimistic
    // updates that happened between page navigations.
    if (this.#items.length === 0 && Array.isArray(items) && items.length) {
      this.#items = items;
    }
  }
  /** Force-replace the array. Use after a full server refresh. */
  replaceAll(items: any[]) {
    this.#items = Array.isArray(items) ? items : [];
  }

  setSearch(q: string) { this.#search = q; }
  setCategory(id: string) { this.#cat = id; }

  getById(id: string) {
    return this.#items.find(p => p.id === id);
  }

  // ── Optimistic mutations ────────────────────────────────────────────
  /**
   * Add a new product. Caller passes the temp product with a
   * `client_id` (UUID) for tracking. Returns the temp product.
   * The server response (with the real UUID) replaces the temp row.
   */
  add(product: any) {
    const temp = { ...product, _local: true, _pending: true };
    this.#items = [temp, ...this.#items];
    return temp;
  }
  /**
   * Update an existing product. `patch` is the changed fields; the
   * caller should also pass `id`. The current row is replaced with
   * the merged result, marked as pending.
   */
  update(id: string, patch: any) {
    let updated: any = null;
    this.#items = this.#items.map(p => {
      if (p.id !== id) return p;
      updated = { ...p, ...patch, _pending: true };
      return updated;
    });
    return updated;
  }
  /** Soft-delete (archive) a product. Keeps the row but flips archived_at. */
  archive(id: string) {
    this.update(id, { archived_at: new Date().toISOString() });
  }
  /** Hard-remove a product from the local list (used on delete success). */
  remove(id: string) {
    this.#items = this.#items.filter(p => p.id !== id);
  }
  /**
   * Replace a temp product (with `client_id`) with the real server
   * response (with the real `id` and any server-computed fields).
   */
  reconcile(clientId: string, real: any) {
    this.#items = this.#items.map(p => p.client_id === clientId ? real : p);
  }
  /**
   * Mark a product as no longer pending (sync succeeded). Use after
   * the server confirms a create/update.
   */
  markSynced(id: string) {
    this.#items = this.#items.map(p => p.id === id
      ? (() => { const { _pending, _local, ...rest } = p; return rest; })()
      : p
    );
  }
  /** Roll back a failed mutation. */
  rollback(clientId: string) {
    this.#items = this.#items.filter(p => p.client_id !== clientId);
  }
}

export const inventory = new InventoryStore();
