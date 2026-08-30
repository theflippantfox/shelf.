import { json } from '@sveltejs/kit';
import { userClient } from '$lib/server/supabase';

/**
 * POST /api/purchase-orders/[id]/items — add a line item to a PO.
 */
export async function POST({ params, locals, request }: import('@sveltejs/kit').RequestEvent) {
  if (!params.id) return json({ error: 'Missing id' }, { status: 400 });
  if (!locals.currentShop) return json({ error: 'No shop' }, { status: 401 });

  const body = await request.json();
  const supabase = userClient({ locals } as any);

  const { data, error } = await supabase
    .from('purchase_order_items')
    .insert({
      purchase_order_id: params.id,
      product_id: body.product,
      product_name: body.product_name,
      product_sku: body.product_sku,
      quantity_ordered: body.quantity_ordered ?? 0,
      unit_cost: body.unit_cost ?? 0,
      line_total: body.line_total ?? 0,
      notes: body.notes ?? null,
    })
    .select()
    .single();

  if (error) return json({ error: error.message }, { status: 400 });
  return json(data, { status: 201 });
}