import { json } from '@sveltejs/kit';
import { adminClient, readItem, updateItem, readItems, createItem } from '$lib/server/directus';

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
  // Void sale only
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
  const { void_reason } = await request.json();
  const client = adminClient();
  const sale   = await client.request(updateItem('sales', params.id, {
    voided_at:   new Date().toISOString(),
    voided_by:   locals.user.id,
    void_reason: void_reason ?? '',
  })) as any;

  // Restore stock for each line item
  const items = await client.request(readItems('sale_items', { filter: { sale: { _eq: params.id } }, fields: ['*'] }));
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
