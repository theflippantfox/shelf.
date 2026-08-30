import { userClient } from '$lib/server/supabase';

/**
 * Single customer page — customer + their sales history.
 */
export async function load({ params, locals }: import('@sveltejs/kit').RequestEvent) {
  if (!params.id) return { customer: null, sales: [] };
  const supabase = userClient({ locals } as any);

  const [
    { data: customer },
    { data: sales = [] },
  ] = await Promise.all([
    supabase.from('customers').select('*').eq('id', params.id).maybeSingle(),
    supabase
      .from('sales')
      .select('id, sale_ref, total, payment_method, created_at, voided_at')
      .eq('customer_id', params.id)
      .is('voided_at', null)
      .order('created_at', { ascending: false })
      .limit(100),
  ]);

  return { customer, sales };
}