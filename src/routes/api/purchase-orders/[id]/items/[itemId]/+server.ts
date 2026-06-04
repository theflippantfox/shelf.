import { json } from '@sveltejs/kit';
import { adminClient, createItem, updateItem, deleteItem } from '$lib/server/directus';

export async function POST({ request, params, locals }) {
  if (!locals.currentShop) return json({ error: 'No shop' }, { status: 401 });
  const body = await request.json();
  const client = adminClient();

  const item = await client.request(createItem('purchase_order_items', {
    ...body,
    purchase_order: params.id,
  }));
  return json(item, { status: 201 });
}

export async function PATCH({ request, params, locals }) {
  if (!locals.currentShop) return json({ error: 'No shop' }, { status: 401 });
  const body = await request.json();
  const client = adminClient();

  const item = await client.request(updateItem('purchase_order_items', params.itemId, body));
  return json(item);
}

export async function DELETE({ request, params, locals }) {
  if (!locals.currentShop) return json({ error: 'No shop' }, { status: 401 });
  const client = adminClient();

  await client.request(deleteItem('purchase_order_items', params.itemId));
  return json({ success: true });
}
