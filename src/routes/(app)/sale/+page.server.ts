import { userClient, userClientFromCtx } from '$lib/server/supabase';

/**
 * Sale / POS page — products (in stock), categories, customers.
 * In edit mode: load the sale + items to prefill the cart.
 */
export async function load({ cookies,  locals, url  }: import('@sveltejs/kit').RequestEvent) {
  const shopId = locals.currentShop!.id;
  const supabase = userClientFromCtx({ cookies } as any);
  const mode    = url.searchParams.get('mode');
  const editId  = url.searchParams.get('id');

  const [
    { data: products = [] },
    { data: categories = [] },
    { data: customers = [] },
  ] = await Promise.all([
    supabase.from('products')
      .select('id, name, sku, price, qty, image_url, category_id, category:categories(id, name, color, icon)')
      .eq('shop_id', shopId)
      .is('archived_at', null)
      .gt('qty', 0)
      .order('name'),
    supabase.from('categories')
      .select('*')
      .eq('shop_id', shopId)
      .is('archived_at', null)
      .order('sort_order')
      .order('name'),
    supabase.from('customers')
      .select('id, name, phone')
      .eq('shop_id', shopId)
      .order('name'),
  ]);

  const base = {
    products, categories, customers,
    taxRate:      locals.currentShop!.tax_rate,
    taxInclusive: locals.currentShop!.tax_inclusive,
    taxName:      locals.currentShop!.tax_name,
  };

  if (mode === 'edit' && editId) {
    const [
      { data: sale },
      { data: items },
    ] = await Promise.all([
      supabase.from('sales').select('*, customer:customers(*)').eq('id', editId).single(),
      supabase.from('sale_items').select('*').eq('sale_id', editId),
    ]);
    return { ...base, editSale: sale, editItems: items ?? [] };
  }

  return base;
}