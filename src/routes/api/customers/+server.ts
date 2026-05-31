import { json } from '@sveltejs/kit';
import { adminClient, readItems, createItem } from '$lib/server/directus';

export async function GET({ locals, url }) {
  if (!locals.currentShop) return json({ error: 'No shop' }, { status: 401 });
  const search = url.searchParams.get('search') ?? '';
  const filter: Record<string, unknown> = { shop: { _eq: locals.currentShop.id } };
  if (search) filter['_or'] = [
    { name:  { _icontains: search } },
    { phone: { _icontains: search } },
    { email: { _icontains: search } },
  ];
  const client    = adminClient();
  const customers = await client.request(readItems('customers', { filter, sort: ['name'], limit: -1 }));
  return json(customers);
}

export async function POST({ request, locals }) {
  if (!locals.currentShop) return json({ error: 'No shop' }, { status: 401 });
  const body     = await request.json();
  const client   = adminClient();
  const customer = await client.request(createItem('customers', { ...body, shop: locals.currentShop.id }));
  return json(customer, { status: 201 });
}
