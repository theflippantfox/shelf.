import { json, error } from '@sveltejs/kit';
import { userClientFromCtx } from '$lib/server/supabase';

/**
 * GET /api/supplier-outstandings
 *
 * Returns the supplier_outstanding view, accessible to shop members.
 * The view is SECURITY DEFINER so even though the underlying payments
 * table is restricted to managers, all members can see the rollup.
 */
export async function GET({ cookies, locals }: import('@sveltejs/kit').RequestEvent) {
  if (!locals.currentShop) throw error(401, 'No shop');
  const supabase = userClientFromCtx({ cookies } as any);
  const { data, error: qErr } = await supabase
    .from('supplier_outstanding')
    .select('supplier_id, supplier_name, outstanding');
  if (qErr) throw error(500, qErr.message);
  return json(data ?? []);
}
