/**
 * /api/cash-register/balance — get current per-destination balance.
 */
import { json } from '@sveltejs/kit';
import { userClientFromCtx } from '$lib/server/supabase';

export async function GET({ cookies, locals }: import('@sveltejs/kit').RequestEvent) {
  if (!locals.currentShop) return json({ destinations: [], total: 0 });

  const { data, error } = await userClientFromCtx({ cookies } as any).rpc('get_register_balance', {
    p_shop_id: locals.currentShop.id,
  });
  if (error) return json({ error: error.message }, { status: 500 });

  const destinations = (data ?? []).map((r: any) => ({
    destination: r.destination,
    balance: Number(r.balance),
  }));
  const total = destinations.reduce((s: number, d: any) => s + d.balance, 0);
  return json({ destinations, total });
}
