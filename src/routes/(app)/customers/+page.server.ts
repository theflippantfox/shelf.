import { adminClient, readItems } from '$lib/server/directus';

export async function load({ locals }) {
  const clients = adminClient();
  const custs   = await clients.request(readItems('customers', {
    filter: { shop: { _eq: locals.currentShop!.id } },
    sort:   ['-total_spent'], limit: -1,
    fields: ['*'],
  }));
  return { customers: custs };
}
