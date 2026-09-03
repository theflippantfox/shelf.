import { userClientFromCtx } from '$lib/server/supabase';

/**
 * /cash-register — server load
 *
 * Returns nothing here; the client fetches the data via the /api
 * endpoints so it can refresh on demand. We just gate the route by
 * making sure the user is in a shop (handled by the (app) layout).
 */
export async function load({ cookies, locals }: import('@sveltejs/kit').RequestEvent) {
  if (!locals.currentShop) {
    return { entries: [], balance: { destinations: [], total: 0 } };
  }

  const supabase = userClientFromCtx({ cookies } as any);

  // Fetch last 100 entries + current balance in parallel
  const [entriesRes, balanceRes] = await Promise.all([
    supabase
      .from('cash_register')
      .select('id, destination, amount, entry_type, source, sale_id, transfer_group_id, notes, created_by, created_at, effective_at, voided_at, void_reason, created_by_profile:profiles!cash_register_created_by_fkey(first_name, last_name)')
      .eq('shop_id', locals.currentShop.id)
      .is('voided_at', null)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase.rpc('get_register_balance', { p_shop_id: locals.currentShop.id }),
  ]);

  return {
    entries: entriesRes.data ?? [],
    balance: {
      destinations: (balanceRes.data ?? []).map((r: any) => ({
        destination: r.destination,
        balance: Number(r.balance),
      })),
      total: ((balanceRes.data ?? []).reduce(
        (s: number, r: any) => s + Number(r.balance), 0,
      )),
    },
  };
}
