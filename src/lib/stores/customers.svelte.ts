

class CustomersStore {
  #items  = $state<any[]>([]);
  #search = $state('');

  get all()    { return this.#items; }
  get search() { return this.#search; }

  get filtered() {
    if (!this.#search) return this.#items;
    const q = this.#search.toLowerCase();
    return this.#items.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.phone ?? '').includes(q) ||
      (c.email ?? '').toLowerCase().includes(q)
    );
  }

  init(items: any[]) { this.#items = items; }
  setSearch(q: string) { this.#search = q; }

  add(customer: any) {
    this.#items = [...this.#items, customer];
  }

  update(customer: any) {
    this.#items = this.#items.map(c => c.id === customer.id ? customer : c);
  }

  remove(id: string) {
    this.#items = this.#items.filter(c => c.id !== id);
  }

  getById(id: string) {
    return this.#items.find(c => c.id === id);
  }
}

export const customers = new CustomersStore();
