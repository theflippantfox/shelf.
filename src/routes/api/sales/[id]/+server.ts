import { json } from '@sveltejs/kit';
import { adminClient, readItem, updateItem, readItems, createItem, deleteItem } from '$lib/server/directus';

export async function GET({ params }) {
  const client = adminClient();
  const sale   = await client.request(readItem('sales', params.id, {
    fields: ['*', 'customer.*', 'served_by.first_name', 'served_by.last_name'],
  }));
  const items  = await client.request(readItems('sale_items', {
    filter: { sale: { _eq: params.id } },
    fields: ['*'],
  }));
  return json({ ...sale as object, items });
}

export async function PATCH({ params, request, locals }) {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json();

  const client = adminClient();

  // ── Void path ──────────────────────────────────────────────────────────────
  if (body.void_reason !== undefined) {
    const sale = await client.request(updateItem('sales', params.id, {
      voided_at:   new Date().toISOString(),
      voided_by:   locals.user.id,
      void_reason: body.void_reason ?? '',
    })) as any;

    const items = await client.request(readItems('sale_items', {
      filter: { sale: { _eq: params.id } },
      fields: ['*'],
    }));
    for (const item of items as any[]) {
      const product = await client.request(readItem('products', item.product, { fields: ['qty'] }));
      await client.request(updateItem('products', item.product, {
        qty: ((product as any).qty ?? 0) + item.qty,
      }));
      await client.request(createItem('stock_log', {
        shop:       sale.shop,
        product:    item.product,
        delta:      item.qty,
        reason:     'void',
        reference:  sale.sale_ref,
        created_by: locals.user.id,
      }));
    }
    return json({ ok: true });
  }

  // ── Edit path ──────────────────────────────────────────────────────────────
  const sale = await client.request(readItem('sales', params.id, {
    fields: ['*', 'customer.*'],
  })) as any;

  const oldCustomerId = typeof sale.customer === 'string' ? sale.customer : sale.customer?.id;
  const oldTotal = sale.total;

  // Update sale record
  await client.request(updateItem('sales', params.id, {
    customer:      body.customer_id ?? sale.customer,
    discount_type: body.discount_type,
    discount_value: body.discount_value,
    discount_amount: body.discount_amount,
    subtotal:      body.subtotal,
    total:         body.total,
    tax_amount:    body.tax_amount,
    payment_method: body.payment_method,
    notes:         body.notes ?? sale.notes,
  }));

  // Sync line items
  const currentItems = await client.request(readItems('sale_items', {
    filter: { sale: { _eq: params.id } },
    fields: ['id', 'product', 'qty', 'product_name', 'product_sku', 'unit_price'],
  }));

  const oldMap = new Map((currentItems as any[]).map((i) => [i.product, i]));
  const newMap = new Map((body.items ?? []).map((i: any) => [i.productId, i]));

  // Removed items → restore stock, delete records, log
  for (const [productId, oldItem] of oldMap) {
    if (!newMap.has(productId)) {
      const product = await client.request(readItem('products', productId, { fields: ['qty'] }));
      await client.request(updateItem('products', productId, {
        qty: ((product as any).qty ?? 0) + oldItem.qty,
      }));
      await client.request(createItem('stock_log', {
        shop:       sale.shop,
        product:    productId,
        delta:      oldItem.qty,
        reason:     'sale',
        reference:  sale.sale_ref,
        created_by: locals.user.id,
      }));
      await client.request(deleteItem('sale_items', oldItem.id));
    }
  }

  // Added / updated items
  for (const [productId, newItem] of newMap) {
    const oldItem = oldMap.get(productId);
    if (!oldItem) {
      // New line item
      const product = await client.request(readItem('products', productId, { fields: ['qty'] }));
      await client.request(updateItem('products', productId, {
        qty: Math.max(0, ((product as any).qty ?? 0) - newItem.qty),
      }));
      await client.request(createItem('sale_items', {
        sale:         params.id,
        product:      productId,
        product_name: newItem.name,
        product_sku:  newItem.sku,
        unit_price:   newItem.unitPrice,
        qty:          newItem.qty,
        line_total:   newItem.unitPrice * newItem.qty,
      }));
      await client.request(createItem('stock_log', {
        shop:       sale.shop,
        product:    productId,
        delta:      -newItem.qty,
        reason:     'sale',
        reference:  sale.sale_ref,
        created_by: locals.user.id,
      }));
    } else if (oldItem.qty !== newItem.qty) {
      // Qty change
      const delta = oldItem.qty - newItem.qty;
      const product = await client.request(readItem('products', productId, { fields: ['qty'] }));
      await client.request(updateItem('products', productId, {
        qty: Math.max(0, ((product as any).qty ?? 0) + delta),
      }));
      await client.request(createItem('stock_log', {
        shop:       sale.shop,
        product:    productId,
        delta:      delta,
        reason:     'sale',
        reference:  sale.sale_ref,
        created_by: locals.user.id,
      }));
      await client.request(updateItem('sale_items', oldItem.id, {
        qty:        newItem.qty,
        line_total: newItem.unitPrice * newItem.qty,
      }));
    }
  }

  // Adjust customer totals
  const newCustomerId = body.customer_id ?? oldCustomerId;
  const totalDelta = body.total - oldTotal;

  if (oldCustomerId && newCustomerId && oldCustomerId !== newCustomerId) {
    const oldCust = await client.request(readItem('customers', oldCustomerId, { fields: ['total_spent'] }));
    await client.request(updateItem('customers', oldCustomerId, {
      total_spent: Math.max(0, ((oldCust as any).total_spent ?? 0) - oldTotal),
    }));
    const newCust = await client.request(readItem('customers', newCustomerId, { fields: ['total_spent'] }));
    await client.request(updateItem('customers', newCustomerId, {
      total_spent: ((newCust as any).total_spent ?? 0) + body.total,
    }));
  } else if (newCustomerId) {
    const cust = await client.request(readItem('customers', newCustomerId, { fields: ['total_spent'] }));
    await client.request(updateItem('customers', newCustomerId, {
      total_spent: ((cust as any).total_spent ?? 0) + totalDelta,
    }));
  }

  const updated = await client.request(readItem('sales', params.id, {
    fields: ['*', 'customer.*', 'served_by.first_name', 'served_by.last_name'],
  }));
  return json(updated);
}
