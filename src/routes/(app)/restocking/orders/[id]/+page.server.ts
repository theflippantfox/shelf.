import { error } from '@sveltejs/kit';
import { userClient, userClientFromCtx } from '$lib/server/supabase';

/**
 * Purchase order detail page — single PO with items + supplier.
 */
export async function load({ cookies,  params, locals  }: import('@sveltejs/kit').RequestEvent) {
  if (!params.id) throw error(404, 'Not found');
  const supabase = userClientFromCtx({ cookies } as any);

  const [
    { data: order, error: oErr },
    { data: items = [] },
  ] = await Promise.all([
    supabase.from('purchase_orders')
      .select('*, supplier:suppliers(id, name, contact_name, phone, email), created_by:profiles!purchase_orders_created_by_fkey(first_name, last_name)')
      .eq('id', params.id)
      .maybeSingle(),
    supabase.from('purchase_order_items')
      .select('*')
      .eq('purchase_order_id', params.id)
      .order('id'),
  ]);

  if (oErr || !order) throw error(404, 'Purchase order not found');
  return { order, items };
}