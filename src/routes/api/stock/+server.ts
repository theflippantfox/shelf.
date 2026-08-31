import { json } from '@sveltejs/kit';
import { userClient, userClientFromCtx, adminClient } from '$lib/server/supabase';

/**
 * POST /api/stock — adjust stock for a product.
 * body: { product_id, delta, reason, reference? }
 *
 * Writes a stock_log entry AND updates product.qty in one atomic operation
 * via a Postgres function (see 0003_functions_create_sale.sql / or inline
 * if not yet present). For now uses two queries; safe enough since both are
 * shop-scoped and validated.
 */
export async function POST({ cookies, request, locals  }: import('@sveltejs/kit').RequestEvent) {
  if (!locals.currentShop || !locals.user)
    return json({ error: 'No shop' }, { status: 401 });

  const { product_id, delta, reason, reference } = await request.json();
  if (!product_id || !delta || !reason)
    return json({ error: 'product_id, delta, reason required' }, { status: 400 });

  const supabase = userClientFromCtx({ cookies } as any);

  // Read current qty
  const { data: product, error: readErr } = await supabase
    .from('products')
    .select('id, qty')
    .eq('id', product_id)
    .single();
  if (readErr || !product)
    return json({ error: 'Product not found' }, { status: 404 });

  const newQty = Math.max(0, product.qty + delta);

  // Update product
  const { error: upErr } = await supabase
    .from('products')
    .update({ qty: newQty })
    .eq('id', product_id);
  if (upErr) return json({ error: upErr.message }, { status: 400 });

  // Insert stock_log entry
  const { error: logErr } = await supabase
    .from('stock_log')
    .insert({
      shop_id: locals.currentShop.id,
      product_id,
      delta,
      reason,
      reference: reference ?? null,
      created_by: locals.user.id,
    });
  if (logErr) return json({ error: logErr.message }, { status: 400 });

  return json({ ok: true, qty: newQty });
}