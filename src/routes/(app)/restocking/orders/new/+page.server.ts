import { adminClient, readItems } from '$lib/server/directus';

export async function load({ locals }) {
  const shopId = locals.currentShop!.id;
  const client = adminClient();

  const [suppliers, products, categories] = await Promise.all([
    client.request(readItems('suppliers', {
      filter: { shop: { _eq: shopId }, is_active: { _eq: true } },
      fields: ['id', 'name', 'currency_code', 'payment_terms'],
      sort: ['name'],
      limit: -1,
    })),
    client.request(readItems('products', {
      filter: { shop: { _eq: shopId }, archived_at: { _null: true } },
      fields: ['id', 'name', 'sku', 'cost_price', 'unit', 'category.id', 'category.name'],
      sort: ['name'],
      limit: -1,
    })),
    client.request(readItems('categories', {
      filter: { shop: { _eq: shopId }, archived_at: { _null: true } },
      fields: ['id', 'name'],
      sort: ['name'],
      limit: -1,
    })),
  ]);

  return { suppliers, products, categories };
}
