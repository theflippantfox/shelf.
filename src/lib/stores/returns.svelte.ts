/**
 * Returns store — single source of truth for sale returns / refunds.
 * Svelte 5 runes-based, reactive across the app.
 *
 * Seeded from the server's GET /api/sales/[id] payload (which now
 * includes a `returns` array). Each sale row in the history also
 * carries a `return_summary` (count + total_refunded) for chips.
 *
 * Mutations:
 *   * \`add\` — optimistic: push the temp return into the store
 *     immediately, then reconcile with the real server row.
 *   * \`reconcile\` — replace the temp return with the real one
 *     (server returns the canonical record after POST).
 *   * \`rollback\` — drop a temp return on server failure.
 */

export interface ReturnItem {
  id:              string;
  product_id:       string;
  product_name:     string;
  product_sku?:     string | null;
  qty:              number;
  unit_price:       number;
  line_refund:      number;
  condition:        'resellable' | 'damaged' | 'expired';
}

export interface SaleReturn {
  id:              string;
  sale_id:         string;
  shop_id:         string;
  processed_by:    string;
  reason:          'defective' | 'wrong_size' | 'changed_mind' | 'overcharge' | 'duplicate_purchase' | 'other';
  notes?:          string | null;
  total_refund:    number;
  refund_method:   'cash' | 'bank' | 'credit_note' | 'none';
  created_at:      string;
  items:           ReturnItem[];
  client_id?:      string;  // for optimistic entries
}

class ReturnsStore {
  // Keyed by sale_id → returns for that sale. Most pages only need
  // returns for a single sale, but this lets the dashboard / history
  // see all of them.
  #bySale = $state<Record<string, SaleReturn[]>>({});

  get bySale() { return this.#bySale; }

  for(saleId: string): SaleReturn[] {
    return this.#bySale[saleId] ?? [];
  }

  // ── Setup ───────────────────────────────────────────────────────────
  /** Seed from the server payload (e.g. the receipt page data). */
  seed(saleId: string, returns: SaleReturn[]) {
    this.#bySale = { ...this.#bySale, [saleId]: returns ?? [] };
  }
  seedAll(map: Record<string, SaleReturn[]>) {
    this.#bySale = { ...this.#bySale, ...map };
  }
  clear() { this.#bySale = {}; }

  // ── Mutations ───────────────────────────────────────────────────────
  /**
   * Optimistic add. The client_id lets us reconcile with the real
   * server row (which has the real UUID).
   */
  add(saleId: string, ret: SaleReturn) {
    const list = this.#bySale[saleId] ?? [];
    this.#bySale = { ...this.#bySale, [saleId]: [ret, ...list] };
  }
  /**
   * Replace the temp row (identified by client_id) with the real
   * server row (with the real UUID + server-computed fields).
   */
  reconcile(saleId: string, clientId: string, real: SaleReturn) {
    const list = (this.#bySale[saleId] ?? []).map(r =>
      r.client_id === clientId ? real : r
    );
    this.#bySale = { ...this.#bySale, [saleId]: list };
  }
  rollback(saleId: string, clientId: string) {
    const list = (this.#bySale[saleId] ?? []).filter(r => r.client_id !== clientId);
    this.#bySale = { ...this.#bySale, [saleId]: list };
  }
}

export const returns = new ReturnsStore();
