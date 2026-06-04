import { json } from '@sveltejs/kit';
import { adminClient, updateItem, deleteItem } from '$lib/server/directus';

export async function PATCH({ params, request, locals }) {
  if (!locals.currentShop) return json({ error: 'No shop' }, { status: 401 });
  const body = await request.json();
  const client = adminClient();

  const supplier = await client.request(updateItem('suppliers', params.id, body));
  return json(supplier);
}

export async function DELETE({ params, locals }) {
  if (!locals.currentShop) return json({ error: 'No shop' }, { status: 401 });
  const client = adminClient();

  // Soft delete as per spec: set is_active to false
  const supplier = await client.request(updateItem('suppliers', params.id, { is_active: false }));
  return json(supplier);
}
