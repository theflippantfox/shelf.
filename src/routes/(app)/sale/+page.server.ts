import { adminClient, readItems, readItem, readItems as readAllItems } from '$lib/server/directus';

export async function load({ locals, url }) {
  const shopId = locals.currentShop!.id;
  const client = adminClient();
  const mode = url.searchParams.get('mode');
  const editId = url.searchParams.get('id');

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

  const base = {
    products,
    categories,
    customers,
    taxRate:      locals.currentShop!.tax_rate,
    taxInclusive: locals.currentShop!.tax_inclusive,
    taxName:      locals.currentShop!.tax_name,
  };

  if (mode === 'edit' && editId) {
    const sale = await client.request(readItem('sales', editId, {
      fields: ['*', 'customer.*'],
    }));
    const items = await client.request(readAllItems('sale_items', {
      filter: { sale: { _eq: editId } },
      fields: ['*'],
    }));
    return { ...base, editSale: sale, editItems: items };
  }

  return base;
}
