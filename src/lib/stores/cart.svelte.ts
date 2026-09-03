

export interface CartItem {
  productId: string;
  name:      string;
  sku:       string;
  unitPrice: number;  // major units (rupees) — same as product.price
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
  #discountValue  = $state(0);  // major units (rupees) for 'amount', 0–100 for 'percent'
  #paymentMethod  = $state<PaymentMethod>('cash');
  #notes          = $state('');
  // Optional override for the sale's created_at timestamp. ISO string or null.
  // When null, the server uses now(). When set, the server writes this exact
  // timestamp to sales.created_at (and stock_log.created_at for the items
  // added by this sale, so analytics reflects the actual sale time).
  #createdAt      = $state<string | null>(null);

  get items()         { return this.#items; }
  get customerId()    { return this.#customerId; }
  get customerName()  { return this.#customerName; }
  get discountType()  { return this.#discountType; }
  get discountValue() { return this.#discountValue; }
  get paymentMethod() { return this.#paymentMethod; }
  get notes()         { return this.#notes; }
  get createdAt()     { return this.#createdAt; }
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

  add(product: any) {
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

  /**
   * Override the sale's created_at timestamp. Pass null to use now()
   * (the default). The server writes this exact timestamp to
   * sales.created_at.
   *
   * Format: any string parseable by `new Date()` — usually a local
   * "YYYY-MM-DDTHH:MM" from the <input type="datetime-local"> picker.
   * We convert to an ISO string so the server can parse it as timestamptz.
   */
  setCreatedAt(iso: string | null) {
    if (!iso) { this.#createdAt = null; return; }
    const d = new Date(iso);
    this.#createdAt = isNaN(d.getTime()) ? null : d.toISOString();
  }

  clear() {
    this.#items         = [];
    this.#customerId    = null;
    this.#customerName  = '';
    this.#discountType  = 'amount';
    this.#discountValue = 0;
    this.#paymentMethod = 'cash';
    this.#notes         = '';
    this.#createdAt     = null;
  }

  loadFromSale(sale: { customer: string | null; discount_type: string; discount_value: number; payment_method: string; notes: string | null; created_at?: string }, items: { product_id: string; product_name: string; product_sku: string; unit_price: number; qty: number }[]) {
    this.#customerId    = sale.customer ?? null;
    this.#customerName  = ''; // populated by caller if available
    this.#discountType  = sale.discount_type as DiscountType;
    // discount_value: in major units for 'amount', in 0–100 for 'percent'.
    this.#discountValue = sale.discount_value;
    this.#paymentMethod = sale.payment_method as PaymentMethod;
    this.#notes         = sale.notes ?? '';
    // Pre-populate the timestamp override with the sale's existing created_at
    // so the user can see/edit it from the checkout sheet.
    this.#createdAt     = sale.created_at ?? null;
    this.#items         = items.map(i => ({
      productId: i.product_id,
      name:      i.product_name,
      sku:       i.product_sku,
      unitPrice: i.unit_price,
      qty:       i.qty,
      maxQty:    9999, // editing past sale, allow qty changes freely
    }));
  }
}

export const cart = new CartStore();
