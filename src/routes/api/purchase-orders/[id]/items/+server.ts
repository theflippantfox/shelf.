import { json } from '@sveltejs/kit';
import { adminClient, createItem } from '$lib/server/directus';

export async function POST({ params, locals, request }) {
  if (!locals.currentShop) {
    return json({ error: 'No shop' }, { status: 401 });
  }

  const body = await request.json();

  const item = await adminClient().request(
    createItem('purchase_order_items', {
      purchase_order: params.id,
      product: body.product,
      product_name: body.product_name,
      product_sku: body.product_sku,
      quantity_ordered: body.quantity_ordered ?? 0,
      unit_cost: body.unit_cost ?? 0,
      line_total: body.line_total ?? 0,
      notes: body.notes ?? null,
    })
  );

  return json(item, { status: 201 });
}
