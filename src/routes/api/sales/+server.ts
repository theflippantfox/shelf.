import { json } from '@sveltejs/kit';
import { adminClient, readItems, createItem, updateItem, readItem } from '$lib/server/directus';
import { appConfig } from '$lib/config/app';

export async function GET({ locals, url }) {
  if (!locals.currentShop) return json({ error: 'No shop' }, { status: 401 });

  const page   = parseInt(url.searchParams.get('page')  ?? '1');
  const limit  = parseInt(url.searchParams.get('limit') ?? '50');
  const from   = url.searchParams.get('from');
  const to     = url.searchParams.get('to');
  const method = url.searchParams.get('method');

  const filter: Record<string, unknown> = {
    shop:      { _eq: locals.currentShop.id },
    voided_at: { _null: true },
  };
  if (from) filter['date_created'] = { ...filter['date_created'] as object, _gte: from };
  if (to)   filter['date_created'] = { ...filter['date_created'] as object, _lte: to   };
  if (method) filter['payment_method'] = { _eq: method };

  const client = adminClient();
  const sales  = await client.request(readItems('sales', {
    filter,
    fields: ['*', 'customer.id', 'customer.name', 'customer.phone', 'served_by.first_name', 'served_by.last_name'],
    sort:  ['-date_created'],
    page,
    limit,
    meta:  ['total_count'],
  }));

  return json(sales);
}

export async function POST({ request, locals }) {
  if (!locals.currentShop || !locals.user)
    return json({ error: 'No shop' }, { status: 401 });

  const body = await request.json();
  const { items, customer_id, discount_type, discount_value, discount_amount,
          subtotal, total, tax_amount, payment_method, notes } = body;

  if (!items?.length) return json({ error: 'Cart is empty' }, { status: 400 });

  const client = adminClient();

  // Generate sale ref: SL-YYYYMMDD-XXXX
  const now    = new Date();
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, '');
  const rand   = Math.random().toString(36).slice(2, 6).toUpperCase();
  const saleRef = `SL-${datePart}-${rand}`;

  // Create sale
  const sale = await client.request(createItem('sales', {
    shop:            locals.currentShop.id,
    sale_ref:        saleRef,
    customer:        customer_id ?? null,
    served_by:       locals.user.id,
    subtotal,
    discount_type:   discount_type ?? 'amount',
    discount_value:  discount_value ?? 0,
    discount_amount: discount_amount ?? 0,
    total,
    tax_amount:      tax_amount ?? 0,
    payment_method,
    notes:           notes ?? null,
  })) as any;

  // Create line items + update stock
  for (const item of items) {
    await client.request(createItem('sale_items', {
      sale:         sale.id,
      product:      item.productId,
      product_name: item.name,
      product_sku:  item.sku,
      unit_price:   item.unitPrice,
      qty:          item.qty,
      line_total:   item.unitPrice * item.qty,
    }));

    // Deduct stock
    const product = await client.request(readItem('products', item.productId, { fields: ['qty'] }));
    await client.request(updateItem('products', item.productId, {
      qty: Math.max(0, (product as any).qty - item.qty),
    }));
    await client.request(createItem('stock_log', {
      shop:       locals.currentShop.id,
      product:    item.productId,
      delta:      -item.qty,
      reason:     'sale',
      reference:  saleRef,
      created_by: locals.user.id,
    }));
  }

  // Update customer stats
  if (customer_id) {
    const cust = await client.request(readItem('customers', customer_id, { fields: ['visit_count','total_spent'] }));
    await client.request(updateItem('customers', customer_id, {
      visit_count: ((cust as any).visit_count ?? 0) + 1,
      total_spent: ((cust as any).total_spent ?? 0) + total,
      last_visit:  now.toISOString(),
    }));
  }

  return json(sale, { status: 201 });
}
