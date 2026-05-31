import type { RecordModel } from 'pocketbase';

export interface CartItem {
  productId: string;
  name:      string;
  sku:       string;
  unitPrice: number;  // minor units
  qty:       number;
  maxQty:    number;
}

export type PaymentMethod = 'cash' | 'credit' | 'transfer';
export type DiscountType   = 'amount' | 'percent';

class CartStore {
  #items          = $state<CartItem[]>([]);
  #customerId     = $state<string | null>(null);
  #customerName   = $state<string>('');
  #discountType   = $state<DiscountType>('amount');
  #discountValue  = $state(0);  // minor units or percentage integer
  #paymentMethod  = $state<PaymentMethod>('cash');
  #notes          = $state('');

  get items()         { return this.#items; }
  get customerId()    { return this.#customerId; }
  get customerName()  { return this.#customerName; }
  get discountType()  { return this.#discountType; }
  get discountValue() { return this.#discountValue; }
  get paymentMethod() { return this.#paymentMethod; }
  get notes()         { return this.#notes; }
  get count()         { return this.#items.reduce((s, i) => s + i.qty, 0); }
  get isEmpty()       { return this.#items.length === 0; }

  get subtotal() {
    return this.#items.reduce((s, i) => s + i.unitPrice * i.qty, 0);
  }

  get discountAmount() {
    if (this.#discountType === 'percent') {
      return Math.round(this.subtotal * this.#discountValue / 100);
    }
    return this.#discountValue;
  }

  get total() {
    return Math.max(0, this.subtotal - this.discountAmount);
  }

  add(product: RecordModel) {
    const exists = this.#items.find(i => i.productId === product.id);
    if (exists) {
      this.setQty(product.id, exists.qty + 1);
    } else {
      this.#items = [...this.#items, {
        productId: product.id,
        name:      product.name,
        sku:       product.sku,
        unitPrice: product.price,
        qty:       1,
        maxQty:    product.qty,
      }];
    }
  }

  setQty(productId: string, qty: number) {
    if (qty <= 0) { this.remove(productId); return; }
    this.#items = this.#items.map(i =>
      i.productId === productId ? { ...i, qty: Math.min(qty, i.maxQty) } : i
    );
  }

  remove(productId: string) {
    this.#items = this.#items.filter(i => i.productId !== productId);
  }

  setCustomer(id: string | null, name: string) {
    this.#customerId   = id;
    this.#customerName = name;
  }

  setDiscount(type: DiscountType, value: number) {
    this.#discountType  = type;
    this.#discountValue = value;
  }

  setPaymentMethod(method: PaymentMethod) {
    this.#paymentMethod = method;
  }

  setNotes(notes: string) { this.#notes = notes; }

  clear() {
    this.#items         = [];
    this.#customerId    = null;
    this.#customerName  = '';
    this.#discountValue = 0;
    this.#notes         = '';
  }
}

export const cart = new CartStore();
