import { userClient, userClientFromCtx } from '$lib/server/supabase';

const PAGE_SIZE = 25;

/**
 * Sale history page — paginated, with search, method, status, credit-status,
 * and date-range filters.
 *
 * Status filter values:
 *   all      — every sale (including voided)
 *   complete — voided_at IS NULL
 *   voided   — voided_at IS NOT NULL
 *
 * Credit status filter values:
 *   all      — every credit status
 *   paid     — credit_status = 'paid' (fully received)
 *   partial  — credit_status = 'partial'
 *   pending  — credit_status = 'pending'
 *   noncredit — payment_method != 'credit' (the default, no filter)
 */
export async function load({ cookies,  locals, url  }: import('@sveltejs/kit').RequestEvent) {
  const shopId = locals.currentShop!.id;
  const supabase = userClientFromCtx({ cookies } as any);

  const page      = Math.max(1, parseInt(url.searchParams.get('page') ?? '1'));
  const q         = (url.searchParams.get('q') ?? '').trim();
  const method    = (url.searchParams.get('method') ?? '').trim();
  const status    = (url.searchParams.get('status') ?? 'all').trim();
  const credit    = (url.searchParams.get('credit') ?? 'all').trim();
  const range     = (url.searchParams.get('range') ?? 'all').trim();
  const limit     = PAGE_SIZE;

  // Date range
  const now    = new Date();
  const today0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let from: Date | null = null;
  if (range === 'today') from = today0;
  else if (range === '7d')  from = new Date(today0.getTime() - 6  * 86_400_000);
  else if (range === '30d') from = new Date(today0.getTime() - 29 * 86_400_000);

  // Build the sales query — now includes credit fields + customer balance
  // so the UI can show "paid ₹X of ₹Y" right in the row.
  let salesQuery = supabase
    .from('sales')
    .select('id, sale_ref, total, payment_method, subtotal, voided_at, created_at, void_reason, customer_id, credit_status, credit_amount_paid, credit_due_date, credit_settled_at, customer:customers(name)')
    .eq('shop_id', shopId)
    .order('created_at', { ascending: false })
    .range((page - 1) * limit, page * limit - 1);

  if (status === 'complete') salesQuery = salesQuery.is('voided_at', null);
  if (status === 'voided')   salesQuery = salesQuery.not('voided_at', 'is', null);
  if (method)                salesQuery = salesQuery.eq('payment_method', method);
  if (from)                  salesQuery = salesQuery.gte('created_at', from.toISOString());
  if (q)                     salesQuery = salesQuery.or(`sale_ref.ilike.%${q}%,customer.name.ilike.%${q}%`);

  // Credit status filter — the trickiest one. If user picks 'partial' or
  // 'pending' or 'paid', restrict to credit sales with that status.
  // If user picks 'all' or anything else, no restriction.
  if (credit === 'paid' || credit === 'partial' || credit === 'pending') {
    salesQuery = salesQuery
      .eq('payment_method', 'credit')
      .eq('credit_status', credit);
  }

  const { data: sales } = await salesQuery;

  // Lightweight counts for filter chips
  async function countWhere(extra: any): Promise<number> {
    let q2 = supabase.from('sales').select('id', { count: 'exact', head: true }).eq('shop_id', shopId);
    if (extra.voided_at_clause === 'complete') q2 = q2.is('voided_at', null);
    if (extra.voided_at_clause === 'voided')   q2 = q2.not('voided_at', 'is', null);
    if (method) q2 = q2.eq('payment_method', method);
    if (from)   q2 = q2.gte('created_at', from!.toISOString());
    if (q)      q2 = q2.or(`sale_ref.ilike.%${q}%,customer.name.ilike.%${q}%`);
    if (extra.credit_status) {
      q2 = q2.eq('payment_method', 'credit').eq('credit_status', extra.credit_status);
    }
    const { count } = await q2;
    return count ?? 0;
  }

  const totalMatching   = await countWhere({});
  const countComplete   = await countWhere({ voided_at_clause: 'complete' });
  const countVoided     = await countWhere({ voided_at_clause: 'voided' });
  // Outstanding credit count (partial + pending) — used for a chip on the UI
  const countCreditPartial  = await countWhere({ credit_status: 'partial' });
  const countCreditPending  = await countWhere({ credit_status: 'pending' });
  const countCreditPaid     = await countWhere({ credit_status: 'paid' });

  return {
    sales: sales ?? [],
    page, limit, totalMatching,
    counts: {
      all: totalMatching, complete: countComplete, voided: countVoided,
      credit_partial: countCreditPartial,
      credit_pending: countCreditPending,
      credit_paid:    countCreditPaid,
    },
    filters: { q, method, status, credit, range },
  };
}
