
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

  init(items: any[]) { this.#items = items; }

  setSearch(q: string) { this.#search = q; }
  setCategory(id: string) { this.#cat = id; }

  add(product: any) {
    this.#items = [...this.#items, product];
  }

  update(product: any) {
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
