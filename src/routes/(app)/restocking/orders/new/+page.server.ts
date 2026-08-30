import { userClient } from '$lib/server/supabase';

/**
 * New purchase order page — load suppliers, products, categories.
 */
export async function load({ locals }: import('@sveltejs/kit').RequestEvent) {
  const shopId = locals.currentShop!.id;
  const supabase = userClient({ locals } as any);

  const [
    { data: suppliers = [] },
    { data: products = [] },
    { data: categories = [] },
  ] = await Promise.all([
    supabase.from('suppliers')
      .select('id, name, currency_code, payment_terms')
      .eq('shop_id', shopId)
      .eq('is_active', true)
      .order('name'),
    supabase.from('products')
      .select('id, name, sku, cost_price, unit, category_id, category:categories(id, name)')
      .eq('shop_id', shopId)
      .is('archived_at', null)
      .order('name'),
    supabase.from('categories')
      .select('id, name')
      .eq('shop_id', shopId)
      .is('archived_at', null)
      .order('name'),
  ]);

  return { suppliers, products, categories };
}