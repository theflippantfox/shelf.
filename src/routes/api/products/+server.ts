import { json } from '@sveltejs/kit';
import { userClient, userClientFromCtx } from '$lib/server/supabase';

/**
 * GET /api/products — list products for the current shop.
 * Supports filters: search (name/sku), category, alert (low-stock).
 *
 * Uses userClient (RLS-correct) instead of adminClient.
 */
export async function GET({ cookies, locals, url  }: import('@sveltejs/kit').RequestEvent) {
  if (!locals.currentShop) return json([]);
  const shopId = locals.currentShop.id;
  const search = url.searchParams.get('search') ?? '';
  const cat    = url.searchParams.get('category') ?? '';
  const alert  = url.searchParams.get('alert');

  const supabase = userClientFromCtx({ cookies } as any);
  let q = supabase
    .from('products')
    .select('id, name, sku, description, price, cost_price, qty, low_stock_threshold, barcode, image_url, archived_at, category_id, category:categories(id, name, color, icon)')
    .eq('shop_id', shopId)
    .is('archived_at', null)
    .order('name');

  if (cat)    q = q.eq('category_id', cat);
  if (search) q = q.or(`name.ilike.%${search}%,sku.ilike.%${search}%`);

  const { data: products, error } = await q;
  if (error) return json({ error: error.message }, { status: 500 });

  let result = products ?? [];
  if (alert === 'true') {
    const threshold = locals.currentShop.low_stock_threshold ?? 10;
    result = result.filter((p: any) =>
      p.qty === 0 || p.qty <= (p.low_stock_threshold ?? threshold)
    );
  }

  return json(result);
}

/**
 * POST /api/products — create a product.
 */
export async function POST({ cookies, request, locals  }: import('@sveltejs/kit').RequestEvent) {
  if (!locals.currentShop) return json({ error: 'No shop' }, { status: 401 });
  const body = await request.json();
  const supabase = userClientFromCtx({ cookies } as any);

  // Auto-generate SKU if not provided
  let sku = body.sku?.trim();
  if (!sku) {
    const { generateSku } = await import('$lib/utils/sku');
    sku = await generateSku(locals.currentShop.id, body.name ?? 'PROD');
  }

  // Whitelist allowed fields. Map `category` (page) → `category_id` (DB).
  // Empty strings are coerced to null so uuid/text columns don't choke.
  const clean = (v: any) => (v === '' || v === undefined ? null : v);
  const allowed: any = {
    name:                body.name,
    sku,
    shop_id:             locals.currentShop.id,
    price:               body.price ?? 0,
    cost_price:          body.cost_price ?? 0,
    qty:                 body.qty ?? 0,
    unit:                body.unit ?? 'pcs',
    category_id:         clean(body.category_id ?? body.category),
    description:         clean(body.description),
    low_stock_threshold: body.low_stock_threshold === '' ? 5 : (body.low_stock_threshold ?? 5),
    barcode:             clean(body.barcode),
  };
  const { data, error } = await supabase
    .from('products')
    .insert(allowed)
    .select()
    .single();

  if (error) return json({ error: error.message }, { status: 400 });
  return json(data, { status: 201 });
}