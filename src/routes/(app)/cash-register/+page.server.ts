import { userClientFromCtx } from '$lib/server/supabase';

/**
 * /cash-register — server load
 *
 * Returns:
 *   * entries   — last 100 cash_register rows
 *   * balance   — per-destination balance + grand total (counter, bank, other;
 *                 the 'credit' destination is EXCLUDED here so the main
 *                 "balance" card doesn't include the receivable total)
 *   * credit    — separate object with the outstanding receivable total
 *                 and a per-customer breakdown for the credit section
 */
export async function load({ cookies, locals }: import('@sveltejs/kit').RequestEvent) {
  if (!locals.currentShop) {
    return {
      entries: [],
      balance: { destinations: [], total: 0 },
      credit: { total: 0, byCustomer: [] },
    };
  }

  const supabase = userClientFromCtx({ cookies } as any);
  const shopId = locals.currentShop.id;

  // Fetch in parallel: last 100 entries, the cash-only balance
  // (counter/bank/other), and the credit-receivables total + per-customer.
  const [entriesRes, balanceRes, creditTotalRes, creditByCustomerRes] = await Promise.all([
    supabase
      .from('cash_register')
      .select('id, destination, amount, entry_type, source, sale_id, transfer_group_id, notes, created_by, created_at, effective_at, voided_at, void_reason, created_by_profile:profiles!cash_register_created_by_fkey(first_name, last_name)')
      .eq('shop_id', shopId)
      .is('voided_at', null)
      .order('created_at', { ascending: false })
      .limit(100),
    // Exclude 'credit' destination from the cash-only balance
    supabase.rpc('get_register_balance', { p_shop_id: shopId }),
    supabase.rpc('outstanding_receivables_total', { p_shop_id: shopId }).maybeSingle(),
    supabase
      .from('sales')
      .select('total, credit_amount_paid, customer_id, customers!inner(name)')
      .eq('shop_id', shopId)
      .eq('payment_method', 'credit')
      .in('credit_status', ['partial', 'pending'])
      .is('voided_at', null)
      .order('created_at', { ascending: false })
      .limit(100),
  ]);

  // Cash-only balance: filter out the 'credit' destination so the main
  // balance card shows real money only.
  const cashDests = ((balanceRes.data ?? []) as any[])
    .filter((r: any) => r.destination !== 'credit')
    .map((r: any) => ({ destination: r.destination, balance: Number(r.balance) }));
  const cashTotal = cashDests.reduce((s: number, r: any) => s + r.balance, 0);

  // Per-customer credit breakdown
  const byCust: Record<string, { name: string; outstanding: number; sales: number }> = {};
  for (const r of (creditByCustomerRes.data ?? []) as any[]) {
    const cid = r.customer_id;
    if (!cid) continue;
    if (!byCust[cid]) byCust[cid] = { name: r.customers?.name ?? 'Unknown', outstanding: 0, sales: 0 };
    byCust[cid].outstanding += Number(r.total) - Number(r.credit_amount_paid ?? 0);
    byCust[cid].sales += 1;
  }
  const creditByCustomer = Object.entries(byCust)
    .map(([id, v]) => ({ id, name: v.name, outstanding: v.outstanding, sales: v.sales }))
    .sort((a, b) => b.outstanding - a.outstanding);

  return {
    entries: entriesRes.data ?? [],
    balance: {
      destinations: cashDests,
      total: cashTotal,
    },
    credit: {
      total: Number((creditTotalRes.data as any)?.total_outstanding ?? 0),
      byCustomer: creditByCustomer,
    },
  };
}
