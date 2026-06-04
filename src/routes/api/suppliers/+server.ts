import { json } from '@sveltejs/kit';
import { adminClient, readItems, createItem, updateItem, deleteItem } from '$lib/server/directus';

export async function GET({ locals, url }) {
  if (!locals.currentShop) return json({ error: 'No shop' }, { status: 401 });
  const shopId = locals.currentShop.id;
  const search = url.searchParams.get('search') ?? '';

  const filter: Record<string, unknown> = {
    shop: { _eq: shopId },
    is_active: { _eq: true },
  };
  if (search) filter['name'] = { _icontains: search };

  const client = adminClient();
  const suppliers = await client.request(readItems('suppliers', {
    filter,
    sort: ['name'],
    limit: -1,
  }));

  return json(suppliers);
}

export async function POST({ request, locals }) {
  if (!locals.currentShop) return json({ error: 'No shop' }, { status: 401 });
  const body = await request.json();
  const client = adminClient();

  const supplier = await client.request(createItem('suppliers', {
    ...body,
    shop: locals.currentShop.id,
  }));
  return json(supplier, { status: 201 });
}
