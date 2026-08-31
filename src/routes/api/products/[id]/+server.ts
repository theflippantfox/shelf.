import { json } from '@sveltejs/kit';
import { userClient, userClientFromCtx } from '$lib/server/supabase';

/**
 * GET /api/products/[id] — single product with category join.
 */
export async function GET({ cookies, params, locals  }: import('@sveltejs/kit').RequestEvent) {
  if (!params.id) return json({ error: 'Missing id' }, { status: 400 });
  const supabase = userClientFromCtx({ cookies } as any);
  const { data, error } = await supabase
    .from('products')
    .select('*, category:categories(*)')
    .eq('id', params.id)
    .single();

  if (error) return json({ error: error.message }, { status: 404 });
  return json(data);
}

/**
 * PATCH /api/products/[id] — update product fields.
 */
export async function PATCH({ cookies, params, request, locals  }: import('@sveltejs/kit').RequestEvent) {
  if (!params.id) return json({ error: 'Missing id' }, { status: 400 });
  if (!locals.currentShop) return json({ error: 'No shop' }, { status: 401 });
  const body = await request.json();
  const supabase = userClientFromCtx({ cookies } as any);

  // Whitelist allowed fields. Map `category` → `category_id`. Empty strings → null.
  const clean = (v: any) => (v === '' || v === undefined ? null : v);
  const allowed: any = {};
  if ('name'                in body) allowed.name = body.name;
  if ('sku'                 in body) allowed.sku = body.sku;
  if ('price'               in body) allowed.price = body.price;
  if ('cost_price'          in body) allowed.cost_price = body.cost_price;
  if ('qty'                 in body) allowed.qty = body.qty;
  if ('unit'                in body) allowed.unit = body.unit;
  if ('description'         in body) allowed.description = clean(body.description);
  if ('low_stock_threshold' in body) allowed.low_stock_threshold = body.low_stock_threshold === '' ? 5 : body.low_stock_threshold;
  if ('barcode'             in body) allowed.barcode = clean(body.barcode);
  if ('category_id'         in body || 'category' in body) {
    allowed.category_id = clean(body.category_id ?? body.category);
  }

  const { data, error } = await supabase
    .from('products')
    .update(allowed)
    .eq('id', params.id)
    .select()
    .single();

  if (error) return json({ error: error.message }, { status: 400 });
  return json(data);
}

/**
 * DELETE /api/products/[id] — soft-delete by setting archived_at.
 */
export async function DELETE({ cookies, params, locals  }: import('@sveltejs/kit').RequestEvent) {
  if (!params.id) return json({ error: 'Missing id' }, { status: 400 });
  const supabase = userClientFromCtx({ cookies } as any);
  const { data, error } = await supabase
    .from('products')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', params.id)
    .select()
    .single();

  if (error) return json({ error: error.message }, { status: 400 });
  return json(data);
}