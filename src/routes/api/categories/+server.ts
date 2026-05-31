import { json } from '@sveltejs/kit';
import { adminClient, readItems, createItem } from '$lib/server/directus';

export async function GET({ locals }) {
  if (!locals.currentShop) return json([]);
  const client = adminClient();
  const cats   = await client.request(readItems('categories', {
    filter: { shop: { _eq: locals.currentShop.id }, archived_at: { _null: true } },
    sort:   ['sort_order', 'name'],
    limit:  -1,
  }));
  return json(cats);
}

export async function POST({ request, locals }) {
  if (!locals.currentShop) return json({ error: 'No shop' }, { status: 401 });
  const body   = await request.json();
  const client = adminClient();
  const cat    = await client.request(createItem('categories', { ...body, shop: locals.currentShop.id }));
  return json(cat, { status: 201 });
}
