import { json } from '@sveltejs/kit';
import { adminClient, readItems, updateItem } from '$lib/server/directus';

export async function GET({ params, locals }) {
  if (!locals.currentShop) return json({ error: 'No shop' }, { status: 401 });
  
  const client = adminClient();
  const order = await client.request(readItems('purchase_orders', {
    filter: { id: { _eq: params.id } },
    fields: ['*', 'supplier.*'],
    limit: 1,
  }));

  if (!order?.length) return json({ error: 'Not found' }, { status: 404 });
  
  // Fetch items for this PO
  const items = await client.request(readItems('purchase_order_items', {
    filter: { purchase_order: { _eq: params.id } },
    sort: ['id'],
    limit: -1,
  }));

  return json({ ...order[0], items });
}

export async function PATCH({ params, request, locals }) {
  if (!locals.currentShop) return json({ error: 'No shop' }, { status: 401 });
  const body = await request.json();
  const client = adminClient();

  const order = await client.request(updateItem('purchase_orders', params.id, body));
  return json(order);
}
