import { error } from '@sveltejs/kit';
import { userClient } from '$lib/server/supabase';

/**
 * Receive page — load PO with items so the form can pre-fill received quantities.
 */
export async function load({ params, locals }: import('@sveltejs/kit').RequestEvent) {
  if (!params.id) throw error(404, 'Not found');
  const supabase = userClient({ locals } as any);

  const [
    { data: order, error: oErr },
    { data: items = [] },
  ] = await Promise.all([
    supabase.from('purchase_orders')
      .select('*, supplier:suppliers(id, name)')
      .eq('id', params.id)
      .maybeSingle(),
    supabase.from('purchase_order_items')
      .select('*, product:products(id, name, sku)')
      .eq('purchase_order_id', params.id)
      .order('id'),
  ]);

  if (oErr || !order) throw error(404, 'Purchase order not found');
  return { order, items };
}