import { json } from '@sveltejs/kit';
import { adminClient, readItems, createItem } from '$lib/server/directus';

export async function GET({ locals }) {
  if (!locals.currentShop) return json([]);
  const tags = await adminClient().request(readItems('tags', {
    filter: { shop: { _eq: locals.currentShop.id } },
    sort:   ['name'], limit: -1,
  }));
  return json(tags);
}

export async function POST({ request, locals }) {
  if (!locals.currentShop) return json({ error: 'No shop' }, { status: 401 });
  const body = await request.json();
  const tag  = await adminClient().request(createItem('tags', { ...body, shop: locals.currentShop.id }));
  return json(tag, { status: 201 });
}
