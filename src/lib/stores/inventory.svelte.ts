import type { RecordModel } from 'pocketbase';
import { appConfig } from '$lib/config/app';

export type StockStatus = 'ok' | 'low' | 'out';

export function getStockStatus(product: RecordModel): StockStatus {
  if (product.qty === 0) return 'out';
  if (product.qty <= (product.low_stock_threshold ?? appConfig.inventory.defaultLowStockThreshold)) return 'low';
  return 'ok';
}

class InventoryStore {
  #items  = $state<RecordModel[]>([]);
  #search = $state('');
  #cat    = $state('');

  get all()    { return this.#items; }
  get search() { return this.#search; }
  get category(){ return this.#cat; }

  get filtered() {
    let list = this.#items;
    if (this.#cat)    list = list.filter(p => p.category === this.#cat);
    if (this.#search) {
      const q = this.#search.toLowerCase();
      list = list.filter(p =>
        p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)
      );
    }
    return list;
  }

  get lowStock()  { return this.#items.filter(p => getStockStatus(p) === 'low'); }
  get outOfStock(){ return this.#items.filter(p => getStockStatus(p) === 'out'); }
  get alertCount(){ return this.lowStock.length + this.outOfStock.length; }

  init(items: RecordModel[]) { this.#items = items; }

  setSearch(q: string) { this.#search = q; }
  setCategory(id: string) { this.#cat = id; }

  add(product: RecordModel) {
    this.#items = [...this.#items, product];
  }

  update(product: RecordModel) {
    this.#items = this.#items.map(p => p.id === product.id ? product : p);
  }

  remove(id: string) {
    this.#items = this.#items.filter(p => p.id !== id);
  }

  getById(id: string) {
    return this.#items.find(p => p.id === id);
  }
}

export const inventory = new InventoryStore();
