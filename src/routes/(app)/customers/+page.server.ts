import { userClient, userClientFromCtx } from '$lib/server/supabase';

/**
 * Customers list page — load customers + computed aggregates
 * (total spent, last visit) from the sales table.
 */
export async function load({ cookies,  locals  }: import('@sveltejs/kit').RequestEvent) {
  const shopId = locals.currentShop!.id;
  const supabase = userClientFromCtx({ cookies } as any);

  const [
    { data: customers = [] },
    { data: sales = [] },
  ] = await Promise.all([
    supabase
      .from('customers')
      .select('*')
      .eq('shop_id', shopId)
      .order('name'),
    supabase
      .from('sales')
      .select('customer_id, total, created_at')
      .eq('shop_id', shopId)
      .is('voided_at', null),
  ]);

  // Aggregate per customer
  const stats: Record<string, { total_spent: number; last_visit: string | null }> = {};
  for (const s of sales as any[]) {
    if (!s.customer_id) continue;
    if (!stats[s.customer_id]) {
      stats[s.customer_id] = { total_spent: 0, last_visit: null };
    }
    stats[s.customer_id].total_spent += s.total ?? 0;
    if (!stats[s.customer_id].last_visit || s.created_at > stats[s.customer_id].last_visit!) {
      stats[s.customer_id].last_visit = s.created_at;
    }
  }

  const enriched = (customers as any[]).map((c) => ({
    ...c,
    total_spent: stats[c.id]?.total_spent ?? 0,
    last_visit:  stats[c.id]?.last_visit  ?? null,
  }));

  return { customers: enriched };
}
