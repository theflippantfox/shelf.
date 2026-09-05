/**
 * Sales store — single source of truth for sales + the dashboard KPIs
 * (today's revenue, count, profit, payment breakdown, top products,
 * top categories, distinct customers).
 *
 * Svelte 5 runes-based, so any component reading `sales.all` (or any
 * of the derived getters) re-renders automatically when the array
 * changes. Seeded from `data.todaySales` (today only) on first mount.
 *
 * Note: this store is intentionally scoped to the current shop. When
 * the shop changes, the page must call `sales.replaceAll([])` and
 * re-seed.
 *
 * Why we keep it client-side: the dashboard's todayRevenue / todayProfit
 * / todayCount cards update the moment a sale is recorded, with no
 * server round-trip and no stale data.
 */

class SalesStore {
  #items = $state<any[]>([]);

  get all()    { return this.#items; }
  get count()  { return this.#items.length; }

  /** Revenue sum across all loaded sales. */
  get totalRevenue() {
    return this.#items.reduce((s, x) => s + (x.total ?? 0), 0);
  }
  get totalProfit() {
    return this.#items.reduce((s, x) => s + (x.profit ?? 0), 0);
  }

  /** Most recent sales first. */
  get recent() {
    return [...this.#items].sort((a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }

  /** Payment method breakdown: { cash: 5, transfer: 3, ... } */
  get paymentBreakdown() {
    const m: Record<string, number> = {};
    for (const s of this.#items) {
      m[s.payment_method] = (m[s.payment_method] ?? 0) + 1;
    }
    return m;
  }

  /** Distinct customers who bought today. */
  get distinctCustomers() {
    const set = new Set<string>();
    for (const s of this.#items) {
      if (s.customer_id) set.add(s.customer_id);
    }
    return set.size;
  }

  // ── Setup ───────────────────────────────────────────────────────────
  init(items: any[]) {
    if (this.#items.length === 0 && Array.isArray(items) && items.length) {
      this.#items = items;
    }
  }
  replaceAll(items: any[]) {
    this.#items = Array.isArray(items) ? items : [];
  }
  clear() { this.#items = []; }

  getById(id: string) {
    return this.#items.find(s => s.id === id);
  }

  // ── Optimistic mutations ────────────────────────────────────────────
  /**
   * Add a sale. Pass the full sale object (with `id` = the client_id
   * from the offline queue, or the real server id if available).
   */
  add(sale: any) {
    this.#items = [sale, ...this.#items];
  }
  /** Used when a void happens — flips voided_at on the matching sale. */
  void_(id: string) {
    this.#items = this.#items.map(s => s.id === id
      ? { ...s, voided_at: new Date().toISOString() }
      : s
    );
  }
  /** Used when a credit payment is recorded — updates credit_amount_paid. */
  recordCreditPayment(id: string, amount: number) {
    this.#items = this.#items.map(s => s.id === id
      ? {
          ...s,
          credit_amount_paid: (s.credit_amount_paid ?? 0) + amount,
          credit_status: (s.credit_amount_paid ?? 0) + amount >= (s.total ?? 0)
            ? 'paid'
            : 'partial',
        }
      : s
    );
  }
  /** Re-derive profit for each sale (used when cost prices change). */
  recomputeProfit(items: any[]) {
    // Caller passes the new profit map: id -> profit number
    this.#items = this.#items.map(s =>
      s.id in items ? { ...s, profit: items[s.id] } : s
    );
  }
}

export const sales = new SalesStore();
