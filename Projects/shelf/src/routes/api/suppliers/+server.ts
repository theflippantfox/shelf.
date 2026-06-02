import { json } from '@sveltejs/kit';
import { adminClient } from '$lib/server/directus';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
  const { shop_id } = locals.user;
  if (!shop_id) return json({ error: 'Shop ID missing' }, { status: 400 });

  try {
    const suppliers = await adminClient().request({
      method: 'GET',
      url: '/items/suppliers',
      query: {
        filter: {
          shop: { _eq: shop_id },
          is_active: { _eq: true }
        },
        fields: ['*']
      }
    });
    return json(suppliers);
  } catch (e) {
    console.error('Error fetching suppliers:', e);
    return json({ error: 'Failed to fetch suppliers' }, { status: 500 });
  }
};

export const POST: RequestHandler = async ({ request, locals }) => {
  const { shop_id } = locals.user;
  if (!shop_id) return json({ error: 'Shop ID missing' }, { status: 400 });

  try {
    const body = await request.json();
    const supplier = await adminClient().request({
      method: 'POST',
      url: '/items/suppliers',
      body: {
        ...body,
        shop: shop_id
      }
    });
    return json(supplier, { status: 201 });
  } catch (e) {
    console.error('Error creating supplier:', e);
    return json({ error: 'Failed to create supplier' }, { status: 500 });
  }
};
