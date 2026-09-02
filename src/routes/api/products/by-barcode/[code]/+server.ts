import { json } from '@sveltejs/kit';
import { userClientFromCtx } from '$lib/server/supabase';

/**
 * GET /api/products/by-barcode/[code]
 *
 * Lookup a product by its barcode, scoped to the current shop via RLS.
 * Used by the PoS barcode scanner — the camera reads the code, the
 * scanner calls this endpoint, and the result is added to the cart.
 *
 * Returns 404 (not 403) for "barcode doesn't exist" so the client can
 * show "no product found for this code" without leaking whether the
 * code exists in another shop.
 */
export async function GET({ cookies, params, locals }: import('@sveltejs/kit').RequestEvent) {
  if (!locals.currentShop) return json({ error: 'No shop' }, { status: 401 });
  const code = decodeURIComponent(params.code ?? '').trim();
  if (!code) return json({ error: 'Empty barcode' }, { status: 400 });

  const supabase = userClientFromCtx({ cookies } as any);
  const { data, error } = await supabase
    .from('products')
    .select('id, name, sku, price, qty, unit, image_url, barcode, low_stock_threshold')
    .eq('shop_id', locals.currentShop.id)
    .eq('barcode', code)
    .is('archived_at', null)
    .maybeSingle();

  if (error) return json({ error: error.message }, { status: 500 });
  if (!data) return json({ error: 'Not found' }, { status: 404 });
  return json(data);
}
