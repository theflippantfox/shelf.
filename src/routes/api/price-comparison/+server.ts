/**
 * /api/price-comparison — for each product, list the latest price from each
 * supplier, mark the cheapest, and return the matrix for the UI.
 */
import { json } from '@sveltejs/kit';
import { userClient, userClientFromCtx } from '$lib/server/supabase';

export async function GET({ cookies, locals  }: import('@sveltejs/kit').RequestEvent) {
  if (!locals.currentShop) return json({ error: 'No shop' }, { status: 401 });
  const supabase = userClientFromCtx({ cookies } as any);

  const [
    { data: products = [] },
    { data: suppliers = [] },
    { data: history = [] },
  ] = await Promise.all([
    supabase.from('products')
      .select('id, name, sku, cost_price')
      .eq('shop_id', locals.currentShop.id)
      .is('archived_at', null),
    supabase.from('suppliers')
      .select('id, name')
      .eq('shop_id', locals.currentShop.id)
      .eq('is_active', true),
    supabase.from('supplier_price_history')
      .select('product_id, supplier_id, unit_cost, recorded_at, purchase_order_id')
      .eq('shop_id', locals.currentShop.id)
      .order('recorded_at', { ascending: false }),
  ]);

  // Build matrix: product_id → supplier_id → latest price
  const matrix: Record<string, Record<string, any>> = {};
  const seen = new Set<string>();

  for (const record of history as any[]) {
    const key = `${record.product_id}_${record.supplier_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!matrix[record.product_id]) matrix[record.product_id] = {};
    matrix[record.product_id][record.supplier_id] = {
      unit_cost: record.unit_cost,
      recorded_at: record.recorded_at,
      purchase_order_id: record.purchase_order_id,
    };
  }

  // Mark cheapest per product
  for (const productId of Object.keys(matrix)) {
    const prices = Object.values(matrix[productId]);
    if (prices.length === 0) continue;
    const minCost = Math.min(...prices.map((p: any) => p.unit_cost));
    for (const supplierId of Object.keys(matrix[productId])) {
      matrix[productId][supplierId].is_cheapest =
        matrix[productId][supplierId].unit_cost === minCost;
    }
  }

  return json({
    products: (products as any[]).map((p) => ({
      id: p.id,
      name: p.name,
      sku: p.sku,
      current_cost_price: p.cost_price,
    })),
    suppliers: (suppliers as any[]).map((s) => ({ id: s.id, name: s.name })),
    matrix,
  });
}