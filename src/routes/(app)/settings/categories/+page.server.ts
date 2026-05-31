import { adminClient, readItems } from '$lib/server/directus';
import { redirect } from '@sveltejs/kit';

export async function load({ locals }) {
  if (!locals.currentShop) throw redirect(302, '/');
  const client = adminClient();
  const cats = await client.request(readItems('categories', {
    filter: { shop: { _eq: locals.currentShop.id }, archived_at: { _null: true } },
    sort: ['sort_order', 'name'], limit: -1,
  }));
  return { categories: cats };
}
