/**
 * Customers store — single source of truth for the customer list.
 * Svelte 5 runes-based, so any component reading `customers.all`
 * re-renders automatically when the array changes.
 *
 * Seeded via `customers.replaceAll(...)` from each page that needs
 * the list (typically the layout). After that, all reads come from
 * the store, NOT from data. Writes are optimistic — UI updates
 * instantly, then the server is hit in the background.
 */

class CustomersStore {
  #items  = $state<any[]>([]);
  #search = $state('');

  get all()    { return this.#items; }
  get search() { return this.#search; }

  get count()  { return this.#items.length; }

  get filtered() {
    if (!this.#search) return this.#items;
    const q = this.#search.toLowerCase();
    return this.#items.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.phone ?? '').includes(q) ||
      (c.email ?? '').toLowerCase().includes(q)
    );
  }

  get byOutstanding() {
    return [...this.#items].sort((a, b) =>
      (b.outstanding_balance ?? 0) - (a.outstanding_balance ?? 0)
    );
  }

  init(items: any[]) {
    if (this.#items.length === 0 && Array.isArray(items) && items.length) {
      this.#items = items;
    }
  }
  replaceAll(items: any[]) {
    this.#items = Array.isArray(items) ? items : [];
  }

  setSearch(q: string) { this.#search = q; }

  getById(id: string) {
    return this.#items.find(c => c.id === id);
  }

  // ── Optimistic mutations ────────────────────────────────────────────
  add(customer: any) {
    const temp = { ...customer, _local: true, _pending: true };
    this.#items = [temp, ...this.#items];
    return temp;
  }
  update(id: string, patch: any) {
    let updated: any = null;
    this.#items = this.#items.map(c => {
      if (c.id !== id) return c;
      updated = { ...c, ...patch, _pending: true };
      return updated;
    });
    return updated;
  }
  remove(id: string) {
    this.#items = this.#items.filter(c => c.id !== id);
  }
  reconcile(clientId: string, real: any) {
    this.#items = this.#items.map(c => c.client_id === clientId ? real : c);
  }
  markSynced(id: string) {
    this.#items = this.#items.map(c => c.id === id
      ? (() => { const { _pending, _local, ...rest } = c; return rest; })()
      : c
    );
  }
  rollback(clientId: string) {
    this.#items = this.#items.filter(c => c.client_id !== clientId);
  }
}

export const customers = new CustomersStore();
