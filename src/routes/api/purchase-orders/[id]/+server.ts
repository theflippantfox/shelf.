import { json, error } from '@sveltejs/kit';
import { userClient, userClientFromCtx } from '$lib/server/supabase';

/**
 * GET /api/purchase-orders/[id] — single PO with items.
 */
export async function GET({ cookies, params, locals  }: import('@sveltejs/kit').RequestEvent) {
  if (!params.id) return json({ error: 'Missing id' }, { status: 400 });
  const supabase = userClientFromCtx({ cookies } as any);

  const [
    { data: order, error: oErr },
    { data: items, error: iErr },
  ] = await Promise.all([
    supabase.from('purchase_orders')
      .select('*, supplier:suppliers(id, name, contact_name, phone), created_by:profiles!purchase_orders_created_by_fkey(first_name, last_name)')
      .eq('id', params.id)
      .single(),
    supabase.from('purchase_order_items')
      .select('*')
      .eq('purchase_order_id', params.id)
      .order('id'),
  ]);

  if (oErr || iErr || !order)
    throw error(404, 'Purchase order not found');
  return json({ ...order, items: items ?? [] });
}

/**
 * PATCH /api/purchase-orders/[id] — partial update.
 */
export async function PATCH({ cookies, params, request, locals  }: import('@sveltejs/kit').RequestEvent) {
  if (!params.id) return json({ error: 'Missing id' }, { status: 400 });
  const body = await request.json();

  const ALLOWED = [
    'status', 'expected_delivery_date', 'received_date',
    'notes', 'order_ref',
    'tax_amount', 'shipping_cost', 'total_cost',
  ];
  const safe: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (ALLOWED.includes(k)) safe[k] = v;
  }

  const supabase = userClientFromCtx({ cookies } as any);

  if ('tax_amount' in safe || 'shipping_cost' in safe) {
    const { data: current } = await supabase
      .from('purchase_orders')
      .select('subtotal, tax_amount, shipping_cost')
      .eq('id', params.id)
      .single();
    if (current) {
      const sub = (current as any).subtotal ?? 0;
      const tax = Number(safe['tax_amount']    ?? (current as any).tax_amount    ?? 0);
      const ship = Number(safe['shipping_cost'] ?? (current as any).shipping_cost ?? 0);
      safe['total_cost'] = sub + tax + ship;
    }
  }

  const { data, error } = await supabase
    .from('purchase_orders')
    .update(safe as any)
    .eq('id', params.id)
    .select()
    .single();

  if (error) return json({ error: error.message }, { status: 400 });
  return json(data);
}

/**
 * DELETE /api/purchase-orders/[id] — cancel (only draft/ordered allowed).
 */
export async function DELETE({ cookies, params, locals  }: import('@sveltejs/kit').RequestEvent) {
  if (!params.id) return json({ error: 'Missing id' }, { status: 400 });
  const supabase = userClientFromCtx({ cookies } as any);

  const { data: current } = await supabase
    .from('purchase_orders')
    .select('status')
    .eq('id', params.id)
    .single();

  if (!current || !['draft', 'ordered'].includes((current as any).status)) {
    return json({ error: 'Only draft or ordered POs can be cancelled' }, { status: 400 });
  }

  const { error } = await supabase
    .from('purchase_orders')
    .update({ status: 'cancelled' })
    .eq('id', params.id);

  if (error) return json({ error: error.message }, { status: 400 });
  return json({ ok: true });
}