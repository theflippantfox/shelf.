/**
 * /api/purchase-orders/[id]/receive — atomic PO receiving.
 *
 * Delegates to receive_purchase_order() SQL function for atomicity.
 * The function:
 *   - updates each PO item's quantity_received, unit_cost, line_total
 *   - increments product.qty for each received item
 *   - writes stock_log entries (positive delta)
 *   - writes supplier_price_history entries
 *   - optionally creates product_batches for items with expiry/batch tracking
 *   - recomputes PO subtotal, total_cost, status (received/partial/ordered)
 */
import { json } from '@sveltejs/kit';
import { userClient, userClientFromCtx } from '$lib/server/supabase';

export async function POST({ cookies, params, request, locals  }: import('@sveltejs/kit').RequestEvent) {
  if (!params.id) return json({ error: 'Missing id' }, { status: 400 });
  if (!locals.currentShop || !locals.user)
    return json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const supabase = userClientFromCtx({ cookies } as any);

  const { error } = await supabase.rpc('receive_purchase_order', {
    p_purchase_order_id: params.id,
    p_items: (body.items ?? []).map((i: any) => ({
      po_item_id: i.id,
      quantity_received: i.quantity_received,
      unit_cost: i.unit_cost,
      expiry_date: i.expiry_date ?? null,
      batch_number: i.batch_number ?? null,
      update_cost_price: i.update_cost_price ?? false,
    })),
    p_tax_amount: Number(body.tax_amount ?? 0),
    p_shipping_cost: Number(body.shipping_cost ?? 0),
    p_received_date: body.received_date || undefined,
    p_notes: body.notes ?? null,
    p_received_by: locals.user.id,
  });

  if (error) return json({ error: error.message }, { status: 500 });
  return json({ success: true });
}