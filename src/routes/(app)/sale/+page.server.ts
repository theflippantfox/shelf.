import { adminClient, readItems } from '$lib/server/directus';

export async function load({ locals }) {
  const shopId = locals.currentShop!.id;
  const client = adminClient();

  const [products, categories, customers] = await Promise.all([
    client.request(readItems('products', {
      filter: { shop: { _eq: shopId }, archived_at: { _null: true }, qty: { _gt: 0 } },
      fields: ['id','name','sku','price','qty','category.id','category.name','category.color','category.icon','image'],
      sort:   ['name'], limit: -1,
    })),
    client.request(readItems('categories', {
      filter: { shop: { _eq: shopId }, archived_at: { _null: true } },
      sort:   ['sort_order','name'], limit: -1,
    })),
    client.request(readItems('customers', {
      filter: { shop: { _eq: shopId } },
      fields: ['id','name','phone'],
      sort:   ['name'], limit: -1,
    })),
  ]);

  return {
    products,
    categories,
    customers,
    taxRate:      locals.currentShop!.tax_rate,
    taxInclusive: locals.currentShop!.tax_inclusive,
    taxName:      locals.currentShop!.tax_name,
  };
}
