import { adminClient, readItem, readItems } from '$lib/server/directus';
import { error } from '@sveltejs/kit';

export async function load({ params }) {
  const client = adminClient();
  try {
    const sale  = await client.request(readItem('sales', params.id, {
      fields: ['*','customer.*','served_by.first_name','served_by.last_name','served_by.email'],
    }));
    const items = await client.request(readItems('sale_items', {
      filter: { sale: { _eq: params.id } }, fields: ['*'], limit: -1,
    }));
    return { sale, items };
  } catch {
    throw error(404, 'Sale not found');
  }
}
