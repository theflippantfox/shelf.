import { json } from '@sveltejs/kit';
import { userClient, userClientFromCtx } from '$lib/server/supabase';

/**
 * POST /api/purchase-orders/[id]/items/[itemId] — duplicate endpoint from the items route.
 * Kept for parity with the previous URL shape.
 */
export async function POST({ cookies, request, params, locals  }: import('@sveltejs/kit').RequestEvent) {
  if (!params.id) return json({ error: 'Missing id' }, { status: 400 });
  const body = await request.json();
  const supabase = userClientFromCtx({ cookies } as any);

  const { data, error } = await supabase
    .from('purchase_order_items')
    .insert({ ...body, purchase_order_id: params.id })
    .select()
    .single();

  if (error) return json({ error: error.message }, { status: 400 });
  return json(data, { status: 201 });
}

/**
 * PATCH /api/purchase-orders/[id]/items/[itemId] — update a line item.
 */
export async function PATCH({ cookies, request, params, locals  }: import('@sveltejs/kit').RequestEvent) {
  if (!params.itemId) return json({ error: 'Missing itemId' }, { status: 400 });
  const body = await request.json();
  const supabase = userClientFromCtx({ cookies } as any);

  const { data, error } = await supabase
    .from('purchase_order_items')
    .update(body)
    .eq('id', params.itemId)
    .select()
    .single();

  if (error) return json({ error: error.message }, { status: 400 });
  return json(data);
}

/**
 * DELETE /api/purchase-orders/[id]/items/[itemId] — remove a line item.
 */
export async function DELETE({ cookies, params, locals  }: import('@sveltejs/kit').RequestEvent) {
  if (!params.itemId) return json({ error: 'Missing itemId' }, { status: 400 });
  const supabase = userClientFromCtx({ cookies } as any);

  const { error } = await supabase
    .from('purchase_order_items')
    .delete()
    .eq('id', params.itemId);

  if (error) return json({ error: error.message }, { status: 400 });
  return json({ success: true });
}