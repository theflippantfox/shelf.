import { userClient, userClientFromCtx } from '$lib/server/supabase';

/**
 * Single customer page — customer + their sales history + outstanding
 * credit balance.
 *
 * The credit data is split into two queries:
 *   * 'open' — sales that are still partial or pending (the customer
 *              still owes money)
 *   * 'history' — fully paid credit sales (for the timeline)
 */
export async function load({ cookies,  params, locals  }: import('@sveltejs/kit').RequestEvent) {
  if (!params.id) return { customer: null, sales: [], openCredit: [] };
  const supabase = userClientFromCtx({ cookies } as any);

  const [
    { data: customer },
    { data: sales = [] },
    { data: openCredit = [] },
  ] = await Promise.all([
    supabase.from('customers').select('*').eq('id', params.id).maybeSingle(),
    supabase
      .from('sales')
      .select('id, sale_ref, total, payment_method, created_at, voided_at')
      .eq('customer_id', params.id)
      .is('voided_at', null)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('sales')
      .select('id, sale_ref, total, credit_status, credit_amount_paid, credit_due_date, credit_settled_at, created_at')
      .eq('customer_id', params.id)
      .in('credit_status', ['partial', 'pending'])
      .is('voided_at', null)
      .order('credit_due_date', { ascending: true, nullsFirst: false }),
  ]);

  return { customer, sales, openCredit };
}
