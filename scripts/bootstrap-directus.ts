#!/usr/bin/env tsx
/**
 * Shëlf — Directus bootstrap
 * Creates all collections using the Directus Collections/Fields/Relations API.
 * Safe to re-run — skips what already exists.
 *
 * Usage:  npx tsx scripts/bootstrap-directus.ts
 * Env:    DIRECTUS_URL, DIRECTUS_ADMIN_TOKEN  (from .env.local)
 */

import 'dotenv/config';

const BASE  = (process.env.DIRECTUS_URL ?? 'http://localhost:8055').replace(/\/$/, '');
const TOKEN = process.env.DIRECTUS_ADMIN_TOKEN ?? '';
if (!TOKEN) { console.error('❌  DIRECTUS_ADMIN_TOKEN not set'); process.exit(1); }

try {
  await fetch('http://shelf_directus:8055/health');
} catch (err: any) {
  console.error(`❌  Directus not reachable at ${BASE}: ${err?.message ?? err}`);
  process.exit(1);
}

const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` };

async function req(method: string, path: string, body?: unknown) {
  const directusBase = (process.env.DIRECTUS_URL ?? 'http://localhost:8055').replace(/\/$/, '');
  const res  = await fetch(`${directusBase}${path}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = { _raw: text }; }
  return { ok: res.ok, status: res.status, data: json?.data ?? json };
}

async function existingCollections(): Promise<Set<string>> {
  const { data } = await req('GET', '/collections');
  return new Set((data ?? []).map((c: any) => c.collection));
}

async function existingFields(col: string): Promise<Set<string>> {
  const { data } = await req('GET', `/fields/${col}`);
  return new Set(Array.isArray(data) ? data.map((f: any) => f.field) : []);
}

async function existingRelations(): Promise<Set<string>> {
  const { data } = await req('GET', '/relations');
  return new Set(Array.isArray(data) ? data.map((r: any) => `${r.collection}.${r.field}`) : []);
}

async function createCollection(name: string, icon: string, fields: any[]) {
  const r = await req('POST', '/collections', { collection: name, meta: { icon }, schema: {}, fields });
  if (!r.ok && r.status !== 409) console.error(`  ✗ "${name}":`, JSON.stringify(r.data).slice(0, 200));
  else console.log(`  ✓ ${name}`);
}

async function addField(col: string, field: any) {
  const r = await req('POST', `/fields/${col}`, field);
  if (!r.ok && r.status !== 409) console.warn(`  ⚠  ${col}.${field.field}:`, JSON.stringify(r.data).slice(0, 120));
}

async function addRelation(col: string, field: string, related: string) {
  const r = await req('POST', '/relations', { collection: col, field, related_collection: related });
  if (!r.ok && r.status !== 409) console.warn(`  ⚠  ${col}.${field} → ${related}:`, JSON.stringify(r.data).slice(0, 120));
  else console.log(`  ↗  ${col}.${field} → ${related}`);
}

// ── Field helpers ─────────────────────────────────────────────────────────────

const PK  = (f = 'id') => ({ field: f, type: 'uuid', meta: { hidden: true, readonly: true, special: ['uuid'] }, schema: { is_primary_key: true, has_auto_increment: false, is_nullable: false } });
const STR = (f: string, opts: any = {}) => ({ field: f, type: 'string', meta: { interface: 'input', ...opts.meta }, schema: { is_nullable: false, ...opts.schema } });
const TXT = (f: string) => ({ field: f, type: 'text',    meta: { interface: 'input-multiline' }, schema: { is_nullable: true } });
const INT = (f: string, def = 0)     => ({ field: f, type: 'integer', meta: { interface: 'input' }, schema: { is_nullable: false, default_value: def } });
const BOL = (f: string, def = false) => ({ field: f, type: 'boolean', meta: { interface: 'boolean' }, schema: { is_nullable: false, default_value: def } });
const TS  = (f: string, nullable = true, special?: string) => ({ field: f, type: 'timestamp', meta: { interface: 'datetime', special: special ? [special] : undefined }, schema: { is_nullable: nullable } });
const FK  = (f: string, nullable = false) => ({ field: f, type: 'uuid', meta: { interface: 'select-dropdown-m2o' }, schema: { is_nullable: nullable } });
const JSN = (f: string) => ({ field: f, type: 'json', meta: { interface: 'input-code', special: ['json'] }, schema: { is_nullable: true } });

// ── Collection definitions ────────────────────────────────────────────────────

const COLLECTIONS: Array<{ name: string; icon: string; fields: any[] }> = [
  {
    name: 'users', icon: 'person',
    fields: [
      PK(),
      STR('first_name'),
      STR('last_name', { schema: { is_nullable: true } }),
      STR('email', { schema: { is_unique: true } }),
      STR('password_hash', { meta: { hidden: true } }),
      STR('avatar',     { schema: { is_nullable: true } }),
      STR('reset_token',            { schema: { is_nullable: true } }),
      TS('reset_token_expires_at',  true),
      TS('date_created', false, 'date-created'),
      TS('date_updated', true,  'date-updated'),
    ],
  },
  {
    name: 'sessions', icon: 'key',
    fields: [
      PK(),
      FK('user'),
      STR('token', { schema: { is_unique: true } }),
      TS('expires_at', false),
      TS('date_created', false, 'date-created'),
    ],
  },
  {
    name: 'shops', icon: 'store',
    fields: [
      PK(),
      STR('name'),
      STR('slug', { schema: { is_unique: true } }),
      STR('country_code',    { schema: { default_value: 'US' } }),
      STR('currency_code',   { schema: { default_value: 'USD' } }),
      STR('currency_symbol', { schema: { default_value: '$' } }),
      STR('currency_locale', { schema: { default_value: 'en-US' } }),
      STR('timezone',        { schema: { default_value: 'UTC' } }),
      STR('date_format',     { schema: { default_value: 'D MMM YYYY' } }),
      STR('time_format',     { schema: { default_value: '12h' } }),
      INT('tax_rate',         0),
      BOL('tax_inclusive',    false),
      STR('tax_name',        { schema: { default_value: 'Tax' } }),
      STR('theme',           { schema: { default_value: 'system' } }),
      STR('primary_color',   { schema: { default_value: '#7B4F8A' } }),
      STR('sidebar_bg',      { schema: { default_value: '#150F1C' } }),
      BOL('onboarding_complete', false),
      STR('onboarding_step', { schema: { default_value: 'shop' } }),
      INT('low_stock_threshold', 10),
      TXT('receipt_header'),
      TXT('receipt_footer'),
      TS('date_created', false, 'date-created'),
      TS('date_updated', true,  'date-updated'),
    ],
  },
  {
    name: 'shop_members', icon: 'group',
    fields: [
      PK(),
      FK('shop'),
      FK('user'),
      STR('role',   { schema: { default_value: 'cashier' } }),
      JSN('permissions'),
      STR('status', { schema: { default_value: 'active' } }),
      TS('date_created', false, 'date-created'),
    ],
  },
  {
    name: 'categories', icon: 'label',
    fields: [
      PK(), FK('shop'),
      STR('name'),
      STR('icon',  { schema: { default_value: 'Tag' } }),
      STR('color', { schema: { default_value: '#7B4F8A' } }),
      INT('sort_order', 0),
      TS('archived_at', true),
    ],
  },
  {
    name: 'tags', icon: 'sell',
    fields: [
      PK(), FK('shop'),
      STR('name'),
      STR('color', { schema: { default_value: '#9b8aaa' } }),
    ],
  },
  {
    name: 'products', icon: 'inventory_2',
    fields: [
      PK(), FK('shop'),
      STR('name'), STR('sku'),
      TXT('description'),
      FK('category', true),
      INT('price', 0), INT('cost_price', 0), INT('qty', 0),
      INT('low_stock_threshold', 10),
      INT('reorder_point', { schema: { is_nullable: true } }),
      FK('preferred_supplier', true),
      STR('unit', { schema: { default_value: 'piece' } }),
      STR('image', { schema: { is_nullable: true } }),
      STR('barcode', { schema: { is_nullable: true } }),
      TS('archived_at', true),
      TS('date_created', false, 'date-created'),
      TS('date_updated', true,  'date-updated'),
    ],
  },
  {
    name: 'customers', icon: 'people',
    fields: [
      PK(), FK('shop'),
      STR('name'),
      STR('phone', { schema: { is_nullable: true } }),
      STR('email', { schema: { is_nullable: true } }),
      TXT('notes'),
      INT('visit_count', 0), INT('total_spent', 0),
      TS('last_visit', true),
      TS('date_created', false, 'date-created'),
      TS('date_updated', true,  'date-updated'),
    ],
  },
  {
    name: 'sales', icon: 'receipt_long',
    fields: [
      PK(), FK('shop'),
      STR('sale_ref'),
      FK('customer', true),
      FK('served_by'),
      INT('subtotal', 0),
      STR('discount_type',   { schema: { default_value: 'amount' } }),
      INT('discount_value',  0), INT('discount_amount', 0),
      INT('total', 0), INT('tax_amount', 0),
      STR('payment_method',  { schema: { default_value: 'cash' } }),
      TXT('notes'),
      TS('voided_at', true),
      FK('voided_by', true),
      TXT('void_reason'),
      TS('date_created', false, 'date-created'),
    ],
  },
  {
    name: 'sale_items', icon: 'list_alt',
    fields: [
      PK(), FK('sale'), FK('product'),
      STR('product_name'), STR('product_sku'),
      INT('unit_price', 0), INT('qty', 1), INT('line_total', 0),
    ],
  },
  {
    name: 'stock_log', icon: 'history',
    fields: [
      PK(), FK('shop'), FK('product'),
      INT('delta', 0),
      STR('reason'),
      STR('reference', { schema: { is_nullable: true } }),
      FK('purchase_order', true),
      FK('created_by'),
      TS('date_created', false, 'date-created'),
    ],
  },
  {
    name: 'suppliers', icon: 'business',
    fields: [
      PK(), FK('shop'),
      STR('name'),
      STR('contact_name', { schema: { is_nullable: true } }),
      STR('phone', { schema: { is_nullable: true } }),
      STR('email', { schema: { is_nullable: true } }),
      TXT('address'),
      STR('payment_terms'), // cash, credit, net_15, net_30, net_60, consignment
      STR('currency_code', { schema: { default_value: 'USD' } }),
      INT('lead_time_days', { schema: { is_nullable: true } }),
      TXT('notes'),
      BOL('is_active', true),
      TS('date_created', false, 'date-created'),
      TS('date_updated', true,  'date-updated'),
    ],
  },
  {
    name: 'purchase_orders', icon: 'assignment',
    fields: [
      PK(), FK('shop'), FK('supplier'),
      STR('order_ref'),
      STR('status'), // draft, ordered, partial, received, cancelled
      TS('order_date', false),
      TS('expected_delivery_date', true),
      TS('received_date', true),
      INT('subtotal', 0),
      INT('tax_amount', 0),
      INT('shipping_cost', 0),
      INT('total_cost', 0),
      STR('bill_image', { schema: { is_nullable: true } }),
      TXT('notes'),
      FK('created_by'),
      TS('date_created', false, 'date-created'),
      TS('date_updated', true,  'date-updated'),
    ],
  },
  {
    name: 'purchase_order_items', icon: 'list',
    fields: [
      PK(), FK('purchase_order'), FK('product', true),
      STR('product_name'), STR('product_sku'),
      INT('quantity_ordered', 0),
      INT('quantity_received', 0),
      INT('unit_cost', 0),
      INT('line_total', 0),
      BOL('is_new_product', false),
      TXT('notes'),
    ],
  },
  {
    name: 'supplier_price_history', icon: 'trending_up',
    fields: [
      PK(), FK('shop'), FK('supplier'), FK('product'),
      INT('unit_cost', 0),
      STR('currency_code'),
      FK('purchase_order', true),
      TS('recorded_at', false),
      STR('notes', { schema: { is_nullable: true } }),
    ],
  },
  {
    name: 'product_batches', icon: 'inventory',
    fields: [
      PK(), FK('shop'), FK('product'), FK('purchase_order_item', true),
      STR('batch_number', { schema: { is_nullable: true } }),
      TS('expiry_date', true),
      INT('quantity_remaining', 0),
      TS('date_created', false, 'date-created'),
    ],
  },
];

// All relations: [collection, field, related_collection]
const RELATIONS: [string, string, string][] = [
  ['sessions',     'user',       'users'],
  ['shop_members', 'shop',       'shops'],
  ['shop_members', 'user',       'users'],
  ['categories',   'shop',       'shops'],
  ['tags',         'shop',       'shops'],
  ['products',     'shop',       'shops'],
  ['products',     'category',   'categories'],
  ['products',     'preferred_supplier', 'suppliers'],
  ['customers',    'shop',       'shops'],
  ['sales',        'shop',       'shops'],
  ['sales',        'customer',   'customers'],
  ['sales',        'served_by',  'users'],
  ['sales',        'voided_by',  'users'],
  ['sale_items',   'sale',       'sales'],
  ['sale_items',   'product',    'products'],
  ['stock_log',    'shop',       'shops'],
  ['stock_log',    'product',    'products'],
  ['stock_log',    'created_by', 'users'],
  ['stock_log',    'purchase_order', 'purchase_orders'],
  ['suppliers',    'shop',       'shops'],
  ['purchase_orders', 'shop',    'shops'],
  ['purchase_orders', 'supplier', 'suppliers'],
  ['purchase_orders', 'created_by', 'users'],
  ['purchase_order_items', 'purchase_order', 'purchase_orders'],
  ['purchase_order_items', 'product', 'products'],
  ['supplier_price_history', 'shop', 'shops'],
  ['supplier_price_history', 'supplier', 'suppliers'],
  ['supplier_price_history', 'product', 'products'],
  ['supplier_price_history', 'purchase_order', 'purchase_orders'],
  ['product_batches', 'shop', 'shops'],
  ['product_batches', 'product', 'products'],
  ['product_batches', 'purchase_order_item', 'purchase_order_items'],
];

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🔌  Connecting to ${BASE}…`);

  const health = await fetch(`${BASE}/server/health`, { headers: H }).catch(() => null);
  if (!health?.ok) { console.error(`❌  Directus not reachable at ${BASE}`); process.exit(1); }
  console.log('✅  Directus is up.');

  const me = await req('GET', '/users/me');
  if (!me.ok) { console.error('❌  DIRECTUS_ADMIN_TOKEN is invalid.'); process.exit(1); }
  console.log(`👤  Authenticated as ${me.data?.email}\n`);

  const existing = await existingCollections();

  console.log('📦  Collections…');
  for (const col of COLLECTIONS) {
    if (existing.has(col.name)) {
      console.log(`  ↩  "${col.name}" exists — patching missing fields…`);
      const existFields = await existingFields(col.name);
      for (const f of col.fields) {
        if (!existFields.has(f.field)) { console.log(`     + ${f.field}`); await addField(col.name, f); }
      }
    } else {
      await createCollection(col.name, col.icon, col.fields);
    }
  }

  console.log('\n🔗  Relations…');
  const existRels = await existingRelations();
  for (const [col, field, related] of RELATIONS) {
    if (existRels.has(`${col}.${field}`)) console.log(`  ↩  ${col}.${field} exists`);
    else await addRelation(col, field, related);
  }

  console.log('\n🔒  Access note:');
  console.log('    Shëlf uses DIRECTUS_ADMIN_TOKEN server-side for all DB ops.');
  console.log('    Shëlf app users are in the custom "users" collection — NOT');
  console.log('    directus_users. Your Directus admin panel is completely');
  console.log('    separate from the POS login system.\n');

  console.log('🎉  Done! Run: npm run dev → http://localhost:5173\n');
}

main().catch(e => { console.error(e); process.exit(1); });
