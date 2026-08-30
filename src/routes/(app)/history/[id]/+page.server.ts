import { userClient } from '$lib/server/supabase';

/**
 * Single sale detail page — sale + line items.
 */
export async function load({ params, locals }: import('@sveltejs/kit').RequestEvent) {
  if (!params.id) return { sale: null, items: [] };
  const supabase = userClient({ locals } as any);

  const [
    { data: sale, error: saleErr },
    { data: items, error: itemsErr },
  ] = await Promise.all([
    supabase.from('sales')
      .select('*, customer:customers(*), served_by:profiles!sales_served_by_fkey(first_name, last_name, email)')
      .eq('id', params.id)
      .single(),
    supabase.from('sale_items')
      .select('*')
      .eq('sale_id', params.id),
  ]);

  if (saleErr || itemsErr || !sale) {
    return { sale: null, items: [] };
  }
  return { sale, items: items ?? [] };
}