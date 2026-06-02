import { json } from '@sveltejs/kit';
import { adminClient } from '$lib/server/directus';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
  const { shop_id } = locals.user;
  if (!shop_id) return json({ error: 'Shop ID missing' }, { status: 400 });

  try {
    // We want products where qty <= reorder_point
    // Directus doesn't support field-to-field comparisons in basic filters.
    // We have to fetch all products with a reorder_point and filter in memory.
    const products = await adminClient().request({
      method: 'GET',
      url: '/items/products',
      query: {
        filter: {
          shop: { _eq: shop_id },
          reorder_point: { _nnull: true }
        },
        fields: ['*', { preferred_supplier: ['name'] }]
      }
    });

    const suggestions = products
      .filter(p => (p.qty || 0) <= (p.reorder_point || 0))
      .map(p => ({
        id: p.id,
        name: p.name,
        qty: p.qty,
        reorder_point: p.reorder_point,
        preferred_supplier: p.preferred_supplier
      }));

    return json(suggestions);
  } catch (e) {
    console.error('Error fetching reorder suggestions:', e);
    return json({ error: 'Failed to fetch suggestions' }, { status: 500 });
  }
};
