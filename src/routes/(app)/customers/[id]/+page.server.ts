import { adminClient, readItem, readItems } from '$lib/server/directus';
import { error } from '@sveltejs/kit';

export async function load({ params, locals }) {
  const client = adminClient();
  try {
    const [customer, sales] = await Promise.all([
      client.request(readItem('customers', params.id)),
      client.request(readItems('sales', {
        filter: { customer: { _eq: params.id }, voided_at: { _null: true } },
        fields: ['id','sale_ref','total','payment_method','date_created'],
        sort:   ['-date_created'],
        limit:  20,
      })),
    ]);
    return { customer, sales };
  } catch {
    throw error(404, 'Customer not found');
  }
}
