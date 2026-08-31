import { userClient, userClientFromCtx } from '$lib/server/supabase';

/**
 * Inventory page — list products + categories for the active shop.
 */
export async function load({ cookies,  locals  }: import('@sveltejs/kit').RequestEvent) {
  const shopId = locals.currentShop!.id;
  const supabase = userClientFromCtx({ cookies } as any);

  const [
    { data: products = [] },
    { data: categories = [] },
  ] = await Promise.all([
    supabase.from('products')
      .select('*, category:categories(id, name, color, icon)')
      .eq('shop_id', shopId)
      .is('archived_at', null)
      .order('name'),
    supabase.from('categories')
      .select('*')
      .eq('shop_id', shopId)
      .is('archived_at', null)
      .order('sort_order')
      .order('name'),
  ]);

  return {
    products,
    categories,
    threshold: locals.currentShop!.low_stock_threshold ?? 10,
  };
}