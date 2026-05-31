import { json } from '@sveltejs/kit';
import { adminClient, readItems, createItem } from '$lib/server/directus';

export async function GET({ locals, url }) {
  if (!locals.currentShop) return json({ error: 'No shop' }, { status: 401 });
  const shopId = locals.currentShop.id;
  const search = url.searchParams.get('search') ?? '';
  const cat    = url.searchParams.get('category') ?? '';
  const alert  = url.searchParams.get('alert');

  const filter: Record<string, unknown> = {
    shop: { _eq: shopId },
    archived_at: { _null: true },
  };
  if (cat) filter['category'] = { _eq: cat };
  if (search) filter['_or'] = [
    { name: { _icontains: search } },
    { sku:  { _icontains: search } },
  ];

  const client = adminClient();
  let products = await client.request(readItems('products', {
    filter,
    fields: ['*', 'category.id', 'category.name', 'category.color', 'category.icon'],
    sort:   ['name'],
    limit:  -1,
  }));

  if (alert === 'true') {
    products = products.filter((p: any) =>
      p.qty === 0 || p.qty <= (p.low_stock_threshold ?? locals.currentShop!.low_stock_threshold ?? 10)
    );
  }

  return json(products);
}

export async function POST({ request, locals }) {
  if (!locals.currentShop) return json({ error: 'No shop' }, { status: 401 });
  const body = await request.json();
  const client = adminClient();

  const product = await client.request(createItem('products', {
    ...body,
    shop: locals.currentShop.id,
  }));
  return json(product, { status: 201 });
}
