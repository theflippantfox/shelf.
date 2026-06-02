import { json } from '@sveltejs/kit';
import { adminClient } from '$lib/server/directus';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals }) => {
  const { shop_id } = locals.user;
  if (!shop_id) return json({ error: 'Shop ID missing' }, { status: 400 });

  const status = url.searchParams.get('status');
  const supplier = url.searchParams.get('supplier');

  const filter: any = { shop: { _eq: shop_id } };
  if (status) filter.status = { _eq: status };
  if (supplier) filter.supplier = { _eq: supplier };

  try {
    const pos = await adminClient().request({
      method: 'GET',
      url: '/items/purchase_orders',
      query: {
        filter,
        fields: ['*', { supplier: ['name'] }],
        sort: ['-date_created']
      }
    });
    return json(pos);
  } catch (e) {
    console.error('Error fetching POs:', e);
    return json({ error: 'Failed to fetch purchase orders' }, { status: 500 });
  }
};

export const POST: RequestHandler = async ({ request, locals }) => {
  const { shop_id, user: { id: user_id } } = locals.user;
  if (!shop_id) return json({ error: 'Shop ID missing' }, { status: 400 });

  try {
    const body = await request.json();
    
    // Auto-generate order reference if not provided
    const order_ref = body.order_ref || `PO-${new Date().toISOString().slice(0,10).replace(/-/g, '')}-${Math.random().toString(36).toUpperCase().slice(2,6)}`;

    const po = await adminClient().request({
      method: 'POST',
      url: '/items/purchase_orders',
      body: {
        ...body,
        order_ref,
        shop: shop_id,
        created_by: user_id
      }
    });
    return json(po, { status: 201 });
  } catch (e) {
    console.error('Error creating PO:', e);
    return json({ error: 'Failed to create purchase order' }, { status: 500 });
  }
};
