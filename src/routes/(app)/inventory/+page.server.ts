import { adminClient, readItems } from '$lib/server/directus';

export async function load({ locals, url }) {
  const shopId   = locals.currentShop!.id;
  const client   = adminClient();
  const filter   = url.searchParams.get('filter');

  const [products, categories] = await Promise.all([
    client.request(readItems('products', {
      filter: { shop: { _eq: shopId }, archived_at: { _null: true } },
      fields: ['*', 'category.id','category.name','category.color','category.icon'],
      sort:   ['name'],
      limit:  -1,
    })),
    client.request(readItems('categories', {
      filter: { shop: { _eq: shopId }, archived_at: { _null: true } },
      sort:   ['sort_order','name'], limit: -1,
    })),
  ]);

  return { products, categories, threshold: locals.currentShop!.low_stock_threshold ?? 10 };
}
