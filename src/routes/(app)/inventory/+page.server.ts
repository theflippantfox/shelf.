import { userClient } from '$lib/server/supabase';

/**
 * Inventory page — list products + categories for the active shop.
 */
export async function load({ locals }: import('@sveltejs/kit').RequestEvent) {
  const shopId = locals.currentShop!.id;
  const supabase = userClient({ locals } as any);

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