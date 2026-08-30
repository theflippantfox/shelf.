import { json } from '@sveltejs/kit';
import { userClient } from '$lib/server/supabase';

/**
 * GET /api/products — list products for the current shop.
 * Supports filters: search (name/sku), category, alert (low-stock).
 *
 * Uses userClient (RLS-correct) instead of adminClient.
 */
export async function GET({ locals, url }: import('@sveltejs/kit').RequestEvent) {
  if (!locals.currentShop) return json([]);
  const shopId = locals.currentShop.id;
  const search = url.searchParams.get('search') ?? '';
  const cat    = url.searchParams.get('category') ?? '';
  const alert  = url.searchParams.get('alert');

  const supabase = userClient({ locals } as any);
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
export async function POST({ request, locals }: import('@sveltejs/kit').RequestEvent) {
  if (!locals.currentShop) return json({ error: 'No shop' }, { status: 401 });
  const body = await request.json();
  const supabase = userClient({ locals } as any);

  // Auto-generate SKU if not provided
  let sku = body.sku?.trim();
  if (!sku) {
    const { generateSku } = await import('$lib/utils/sku');
    sku = await generateSku(locals.currentShop.id, body.name ?? 'PROD');
  }

  const { data, error } = await supabase
    .from('products')
    .insert({
      ...body,
      sku,
      shop_id: locals.currentShop.id,
    })
    .select()
    .single();

  if (error) return json({ error: error.message }, { status: 400 });
  return json(data, { status: 201 });
}