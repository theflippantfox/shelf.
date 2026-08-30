import { redirect } from '@sveltejs/kit';
import { userClient } from '$lib/server/supabase';

/**
 * Settings → Categories page — list of categories for the active shop.
 */
export async function load({ locals }: import('@sveltejs/kit').RequestEvent) {
  if (!locals.currentShop) throw redirect(302, '/');
  const supabase = userClient({ locals } as any);
  const { data: categories = [] } = await supabase
    .from('categories')
    .select('*')
    .eq('shop_id', locals.currentShop.id)
    .is('archived_at', null)
    .order('sort_order', { ascending: true, nullsFirst: false })
    .order('name');

  return { categories };
}