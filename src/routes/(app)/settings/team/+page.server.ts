import { adminClient, readItems } from '$lib/server/directus';
import { redirect } from '@sveltejs/kit';

export async function load({ locals }) {
  if (!locals.currentShop) throw redirect(302, '/');
  if (!locals.shopMember || locals.shopMember.role !== 'owner') throw redirect(302, '/settings');
  const client  = adminClient();
  const members = await client.request(readItems('shop_members', {
    filter: { shop: { _eq: locals.currentShop.id } },
    fields: ['id','role','status','permissions','user.id','user.first_name','user.last_name','user.email'],
    sort:   ['role', 'user.first_name'], limit: -1,
  }));
  return { members };
}
