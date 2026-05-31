import { adminClient, readItems } from '$lib/server/directus';

export async function load({ locals, url }) {
  const shopId = locals.currentShop!.id;
  const page   = Math.max(1, parseInt(url.searchParams.get('page') ?? '1'));
  const limit  = 50;
  const client = adminClient();

  const sales = await client.request(readItems('sales', {
    filter: { shop: { _eq: shopId } },
    fields: [
      'id', 'sale_ref', 'total', 'payment_method',
      'voided_at', 'date_created',
      'customer.name',
      // served_by now refers to our custom users collection
      'served_by.first_name', 'served_by.last_name',
    ],
    sort:  ['-date_created'],
    page,
    limit,
  })) as any[];

  return { sales, page, limit };
}
