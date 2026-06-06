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
  if (!body.supplier) {
    return json({ error: 'Missing supplier' }, { status: 400 });
  }

  const client = adminClient();
  const now = new Date().toISOString().split('T')[0];

  const order = await client.request(
    createItem('purchase_orders', {
      shop: locals.currentShop.id,
      supplier: body.supplier,
      status: body.status ?? 'draft',
      order_date: body.order_date ?? now,
      expected_delivery_date: body.expected_delivery_date ?? null,
      order_ref: body.order_ref ?? `PO-${now.replace(/-/g, '')}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
      notes: body.notes ?? null,
      tax_amount: body.tax_amount ?? 0,
      shipping_cost: body.shipping_cost ?? 0,
      ...(locals.user?.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(locals.user.id)
        ? { created_by: locals.user.id }
        : {}),
    })
  );

  return json(order, { status: 201 });
}
