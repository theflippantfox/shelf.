import { error } from '@sveltejs/kit';
import { userClientFromCtx } from '$lib/server/supabase';

/**
 * /sale/[id] — receipt page for a single sale.
 *
 * Returns the sale with its line items, any returns against it, the
 * customer, the served_by profile, and the per-product "already
 * returned" qty map (so the return sheet can cap inputs).
 */
export async function load({ cookies, params, locals }: import('@sveltejs/kit').RequestEvent) {
  if (!params.id)          throw error(400, 'Missing sale id');
  if (!locals.currentShop) throw error(401, 'No shop');

  const supabase = userClientFromCtx({ cookies } as any);
  const saleId   = params.id;

  // 1. Sale + line items + customer + served_by profile
  const [{ data: sale, error: saleErr }, { data: items }] = await Promise.all([
    supabase
      .from('sales')
      .select('*, customer:customers(*), served_by:profiles!sales_served_by_fkey(first_name, last_name, avatar_url)')
      .eq('id', saleId)
      .single(),
    supabase
      .from('sale_items')
      .select('id, product_id, product_name, product_sku, qty, unit_price, line_total')
      .eq('sale_id', saleId),
  ]);
  if (saleErr || !sale) throw error(404, saleErr?.message ?? 'Sale not found');
  if ((sale as any).shop_id !== (locals.currentShop as any).id) throw error(403, 'Wrong shop');

  // 2. Returns against this sale (most recent first) + their items
  const { data: returns } = await supabase
    .from('sale_returns')
    .select('*, items:sale_return_items(*)')
    .eq('sale_id', saleId)
    .order('created_at', { ascending: false });

  // 3. Per-product already-returned qty (so the return sheet can cap
  //    the qty input at "sold - already returned").
  const returnedQty: Record<string, number> = {};
  for (const r of (returns ?? []) as any[]) {
    for (const it of (r.items ?? []) as any[]) {
      returnedQty[it.product_id] = (returnedQty[it.product_id] ?? 0) + it.qty;
    }
  }

  return {
    sale: { ...(sale as any), items: items ?? [] },
    returns: returns ?? [],
    returnedQty,
  };
}
