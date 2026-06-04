import { json } from '@sveltejs/kit';
import { adminClient, readItems, createItem } from '$lib/server/directus';

export async function GET({ locals, url }) {
  if (!locals.currentShop) return json({ error: 'No shop' }, { status: 401 });
  const shopId = locals.currentShop.id;
  
  const status = url.searchParams.get('status') ?? '';
  const supplier = url.searchParams.get('supplier') ?? '';

  const filter: Record<string, unknown> = {
    shop: { _eq: shopId },
  };
  if (status) filter['status'] = { _eq: status };
  if (supplier) filter['supplier'] = { _eq: supplier };

  const client = adminClient();
  const orders = await client.request(readItems('purchase_orders', {
    filter,
    sort: ['-order_date'],
    fields: ['*'],
    limit: -1,
  }));

  return json(orders);
}

export async function POST({ request, locals }) {
  if (!locals.currentShop) return json({ error: 'No shop' }, { status: 401 });
  const body = await request.json();
  const client = adminClient();

  // Auto-generate order_ref if not provided
  const orderRef = body.order_ref ?? `PO-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${Math.random().toString(36).substring(2,6).toUpperCase()}`;

  const order = await client.request(createItem('purchase_orders', {
    ...body,
    order_ref: orderRef,
    shop: locals.currentShop.id,
    status: body.status ?? 'draft',
    order_date: body.order_date ?? new Date().toISOString().split('T')[0],
  }));
  
  return json(order, { status: 201 });
}
