/**
 * Shëlf schema types.
 * Users authenticate via Shëlf's own `users` collection — not directus_users.
 * Directus is the database/admin tool; it does NOT manage app auth.
 */

export interface User {
  id:             string;
  first_name:     string;
  last_name:      string;
  email:          string;
  password_hash:  string;   // bcrypt, never sent to the client
  avatar:         string | null;
  date_created:   string;
  date_updated:   string;
}

export interface Session {
  id:         string;
  user:       string | User;
  token:      string;        // random UUID stored in httpOnly cookie
  expires_at: string;
  date_created: string;
}

export interface Shop {
  id:                  string;
  name:                string;
  slug:                string;
  country_code:        string;
  currency_code:       string;
  currency_symbol:     string;
  currency_locale:     string;
  timezone:            string;
  date_format:         string;
  time_format:         '12h' | '24h';
  tax_rate:            number;
  tax_inclusive:       boolean;
  tax_name:            string;
  theme:               'light' | 'dark' | 'system';
  primary_color:       string;
  sidebar_bg:          string;
  onboarding_complete: boolean;
  onboarding_step:     string;
  low_stock_threshold: number;
  receipt_header:      string | null;
  receipt_footer:      string | null;
  date_created:        string;
  date_updated:        string;
}

export interface ShopMember {
  id:           string;
  shop:         string | Shop;
  user:         string | User;          // ← custom users, not directus_users
  role:         'owner' | 'manager' | 'cashier';
  permissions:  Record<string, boolean> | null;
  status:       'active' | 'invited' | 'suspended';
  date_created: string;
}

export interface Category {
  id:          string;
  shop:        string;
  name:        string;
  icon:        string;
  color:       string;
  sort_order:  number;
  archived_at: string | null;
}

export interface Tag {
  id:    string;
  shop:  string;
  name:  string;
  color: string;
}

export interface Product {
  id:                  string;
  shop:                string;
  name:                string;
  sku:                 string;
  description:         string | null;
  category:            string | Category | null;
  tags:                string[] | Tag[];
  price:               number;
  cost_price:          number;
  qty:                 number;
  low_stock_threshold: number;
  reorder_point:       number | null;
  preferred_supplier:  string | Supplier | null;
  unit:                string;
  image:               string | null;
  barcode:             string | null;
  archived_at:         string | null;
  date_created:        string;
  date_updated:        string;
}

export interface Customer {
  id:           string;
  shop:         string;
  name:         string;
  phone:        string | null;
  email:        string | null;
  notes:        string | null;
  visit_count:  number;
  total_spent:  number;
  last_visit:   string | null;
  date_created: string;
  date_updated: string;
}

export interface Sale {
  id:              string;
  shop:            string;
  sale_ref:        string;
  customer:        string | Customer | null;
  served_by:       string | User;      // ← custom users
  subtotal:        number;
  discount_type:   'amount' | 'percent';
  discount_value:  number;
  discount_amount: number;
  total:           number;
  tax_amount:      number;
  payment_method:  'cash' | 'credit' | 'transfer';
  notes:           string | null;
  voided_at:       string | null;
  voided_by:       string | User | null;
  void_reason:     string | null;
  date_created:    string;
}

export interface SaleItem {
  id:           string;
  sale:         string;
  product:      string | Product;
  product_name: string;
  product_sku:  string;
  unit_price:   number;
  qty:          number;
  line_total:   number;
}

export interface StockLog {
  id:           string;
  shop:         string;
  product:      string | Product;
  delta:        number;
  reason:       'sale' | 'restock' | 'adjustment' | 'void';
  reference:    string | null;
  purchase_order: string | null;
  created_by:   string | User;         // ← custom users
  date_created: string;
}

export interface Supplier {
  id:             string;
  shop:           string;
  name:           string;
  contact_name:   string | null;
  phone:           string | null;
  email:          string | null;
  address:        string | null;
  payment_terms:  'cash' | 'credit' | 'net_15' | 'net_30' | 'net_60' | 'consignment';
  currency_code:  string;
  lead_time_days: number | null;
  notes:          string | null;
  is_active:      boolean;
  date_created:   string;
  date_updated:   string;
}

export interface PurchaseOrder {
  id:                    string;
  shop:                  string;
  supplier:              string | Supplier;
  order_ref:             string;
  status:                'draft' | 'ordered' | 'partial' | 'received' | 'cancelled';
  order_date:            string;
  expected_delivery_date: string | null;
  received_date:         string | null;
  subtotal:              number;
  tax_amount:            number;
  shipping_cost:         number;
  total_cost:            number;
  bill_image:            string | null;
  notes:                string | null;
  created_by:            string | User;
  date_created:          string;
  date_updated:          string;
}

export interface PurchaseOrderItem {
  id:               string;
  purchase_order:   string;
  product:          string | Product | null;
  product_name:     string;
  product_sku:      string;
  quantity_ordered: number;
  quantity_received: number;
  unit_cost:        number;
  line_total:       number;
  is_new_product:   boolean;
  notes:            string | null;
}

export interface SupplierPriceHistory {
  id:             string;
  shop:           string;
  supplier:       string | Supplier;
  product:        string | Product;
  unit_cost:      number;
  currency_code:  string;
  purchase_order: string | null;
  recorded_at:    string;
  notes:          string | null;
}

export interface ProductBatch {
  id:                  string;
  shop:                string;
  product:            string | Product;
  purchase_order_item: string | null;
  batch_number:        string | null;
  expiry_date:        string | null;
  quantity_remaining: number;
  date_created:        string;
}

export type ShelfSchema = {
  users:        User[];
  sessions:     Session[];
  shops:        Shop[];
  shop_members: ShopMember[];
  categories:   Category[];
  tags:         Tag[];
  products:     Product[];
  customers:    Customer[];
  sales:        Sale[];
  sale_items:   SaleItem[];
  stock_log:    StockLog[];
  suppliers:    Supplier[];
  purchase_orders: PurchaseOrder[];
  purchase_order_items: PurchaseOrderItem[];
  supplier_price_history: SupplierPriceHistory[];
  product_batches: ProductBatch[];
};
