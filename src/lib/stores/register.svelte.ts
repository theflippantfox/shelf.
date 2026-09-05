/**
 * Cash register store — single source of truth for register entries,
 * balance, and outstanding credit summary. Svelte 5 runes-based.
 *
 * Seeded from `data.entries` + `data.balance` + `data.credit` on
 * first mount. After that, reads come from the store and writes
 * (manual entries, transfers, voids, credit payments) are
 * optimistic — the UI updates instantly, then the server is hit
 * in the background.
 *
 * Why we keep balance derived: the balance is just `sum(amount)`
 * per destination. Storing it as a column would be a denormalised
 * cache that could go stale. Computing it from the entries is
 * always correct.
 */

export interface RegisterEntry {
  id:                 string;
  destination:        string;     // 'counter' | 'bank' | 'other' | 'credit'
  amount:             number;      // signed
  entry_type:         string;
  source:             string;
  sale_id?:           string | null;
  voided_entry_id?:   string | null;
  transfer_group_id?: string | null;
  notes?:             string | null;
  created_at:         string;
  effective_at?:      string;
  voided_at?:         string | null;
  void_reason?:       string | null;
  created_by?:        string;
  _local?:            boolean;     // optimistic-only
  _pending?:          boolean;
}

class RegisterStore {
  #entries  = $state<RegisterEntry[]>([]);
  #outstanding = $state<number>(0);  // from server; updated by sync logic

  get all()     { return this.#entries; }
  get count()   { return this.#entries.length; }
  get outstanding() { return this.#outstanding; }

  /** Most recent first, matching the server ordering. */
  get recent() {
    return [...this.#entries].sort((a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }

  /** Group entries by day (YYYY-MM-DD in shop tz). Most recent first. */
  get groupedByDay() {
    const groups = new Map<string, RegisterEntry[]>();
    for (const e of this.recent) {
      const day = (e.created_at ?? '').slice(0, 10);
      if (!groups.has(day)) groups.set(day, []);
      groups.get(day)!.push(e);
    }
    return Array.from(groups.entries()).map(([day, items]) => ({ day, items }));
  }

  /** Per-destination balance. Excludes 'credit' (the receivable). */
  get balance() {
    const dests: Record<string, number> = { counter: 0, bank: 0, other: 0 };
    for (const e of this.#entries) {
      if (e.voided_at) continue;
      if (e.destination === 'credit') continue;  // receivable, not cash
      dests[e.destination] = (dests[e.destination] ?? 0) + (e.amount ?? 0);
    }
    const total = Object.values(dests).reduce((s, v) => s + v, 0);
    return {
      destinations: Object.entries(dests).map(([destination, balance]) => ({ destination, balance })),
      total,
    };
  }

  init(entries: any[], outstanding = 0) {
    if (this.#entries.length === 0 && Array.isArray(entries)) {
      this.#entries = entries;
    }
    this.#outstanding = outstanding;
  }
  replaceAll(entries: any[], outstanding = 0) {
    this.#entries = Array.isArray(entries) ? entries : [];
    this.#outstanding = outstanding;
  }
  setOutstanding(n: number) { this.#outstanding = n; }

  add(entry: RegisterEntry) {
    this.#entries = [entry, ...this.#entries];
  }
  /** Replace a temp entry (with client_id) with the real server row. */
  reconcile(clientId: string, real: RegisterEntry) {
    this.#entries = this.#entries.map(e => (e as any).client_id === clientId ? real : e);
  }
  /** Soft-void a manual entry. The balance getter ignores voided entries. */
  void_(id: string, reason: string) {
    this.#entries = this.#entries.map(e => e.id === id
      ? { ...e, voided_at: new Date().toISOString(), void_reason: reason }
      : e
    );
  }
  /** Used by the offline queue when a write succeeds. */
  markSynced(id: string) {
    this.#entries = this.#entries.map(e => e.id === id
      ? (() => { const { _pending, _local, ...rest } = e as any; return rest as RegisterEntry; })()
      : e
    );
  }
  rollback(clientId: string) {
    this.#entries = this.#entries.filter(e => (e as any).client_id !== clientId);
  }
}

export const register = new RegisterStore();
