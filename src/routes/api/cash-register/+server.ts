/**
 * /api/cash-register — list, add manual entries.
 *
 * GET  /api/cash-register           — paginated history (newest first)
 * GET  /api/cash-register?from=&to=  — date range filter
 * POST /api/cash-register           — add an expense / injection / adjustment
 *
 * Permissions (enforced here, NOT in the DB):
 *   * owner + manager: expense, injection, adjustment
 *   * cashier:        expense only
 *   * suspended:      nothing (the API will return 403)
 *
 * The actual writes go through SECURITY DEFINER RPCs (log_register_entry,
 * void_register_entry) so we don't have to expose INSERT/UPDATE RLS on
 * the table to the user.
 */
import { json } from '@sveltejs/kit';
import { userClient, userClientFromCtx } from '$lib/server/supabase';

/**
 * GET /api/cash-register
 *
 * Query params:
 *   from   ISO date (inclusive lower bound on effective_at or created_at)
 *   to     ISO date (inclusive upper bound)
 *   limit  max rows (default 100, max 500)
 *
 * Returns the cash_register rows for the current shop, newest first,
 * excluding voided rows by default. The UI can show voided rows in
 * a "show voided" toggle if it wants.
 */
export async function GET({ cookies, locals, url }: import('@sveltejs/kit').RequestEvent) {
  if (!locals.currentShop) return json([]);

  const supabase = userClientFromCtx({ cookies } as any);
  const from = url.searchParams.get('from');
  const to   = url.searchParams.get('to');
  const includeVoided = url.searchParams.get('include_voided') === '1';
  const limit = Math.min(500, parseInt(url.searchParams.get('limit') ?? '100'));

  let q = supabase
    .from('cash_register')
    .select('id, destination, amount, entry_type, source, sale_id, transfer_group_id, notes, created_by, created_at, effective_at, voided_at, void_reason, created_by_profile:profiles!cash_register_created_by_fkey(first_name, last_name)')
    .eq('shop_id', locals.currentShop.id)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (from) q = q.gte('effective_at', from);
  if (to)   q = q.lte('effective_at', to);
  if (!includeVoided) q = q.is('voided_at', null);

  const { data, error } = await q;
  if (error) return json({ error: error.message }, { status: 500 });
  return json(data ?? []);
}

/**
 * POST /api/cash-register
 *
 * Body: {
 *   destination: 'counter' | 'bank' | 'other',
 *   amount:      number,  // signed; positive=IN, negative=OUT
 *   entry_type:  'expense' | 'injection' | 'adjustment',
 *   notes:       string,
 *   effective_at?: ISO date (defaults to now),
 *   adjusts_id?:  uuid  (required for adjustments)
 * }
 */
export async function POST({ cookies, request, locals }: import('@sveltejs/kit').RequestEvent) {
  if (!locals.currentShop || !locals.user) {
    return json({ error: 'No shop' }, { status: 401 });
  }

  // Pull role from the active membership
  const { data: member, error: memberErr } = await userClientFromCtx({ cookies } as any)
    .from('shop_members')
    .select('role, status')
    .eq('shop_id', locals.currentShop.id)
    .eq('user_id', locals.user.id)
    .single();
  if (memberErr || !member) return json({ error: 'No membership' }, { status: 403 });
  if (member.status !== 'active') return json({ error: 'Membership is not active' }, { status: 403 });

  const body = await request.json();
  const { destination, amount, entry_type, notes, effective_at, adjusts_id } = body ?? {};

  if (!destination || !['counter','bank','other'].includes(destination)) {
    return json({ error: 'Invalid destination' }, { status: 400 });
  }
  if (!entry_type || !['expense','injection','adjustment'].includes(entry_type)) {
    return json({ error: 'Invalid entry_type (must be expense, injection, or adjustment)' }, { status: 400 });
  }
  if (typeof amount !== 'number' || isNaN(amount) || amount === 0) {
    return json({ error: 'Amount must be a non-zero number' }, { status: 400 });
  }

  // Sign convention: the user can send either a signed amount (e.g.
  // -250 for an expense) or an unsigned one and let the entry_type
  // determine the sign. We accept both.
  //   expense   → must be negative (money going out)
  //   injection → must be positive (money coming in)
  //   adjustment → can be either (sign depends on what it's correcting)
  if (entry_type === 'expense'   && amount > 0) return json({ error: 'Expense amount must be negative' }, { status: 400 });
  if (entry_type === 'injection' && amount < 0) return json({ error: 'Injection amount must be positive' }, { status: 400 });

  // Role checks
  const role = (member as any).role as 'owner' | 'manager' | 'cashier';
  if (entry_type === 'injection' && role === 'cashier') {
    return json({ error: 'Only owners and managers can add injections' }, { status: 403 });
  }
  if (entry_type === 'adjustment' && role === 'cashier') {
    return json({ error: 'Only owners and managers can add adjustments' }, { status: 403 });
  }

  // Call the RPC
  const { data, error } = await userClientFromCtx({ cookies } as any).rpc('log_register_entry', {
    p_shop_id: locals.currentShop.id,
    p_destination: destination,
    p_amount: amount,
    p_entry_type: entry_type,
    p_notes: notes ?? '',
    p_actor_id: locals.user.id,
    p_effective_at: effective_at ?? null,
    p_adjusts_id: adjusts_id ?? null,
  });
  if (error) return json({ error: error.message }, { status: 400 });
  return json(data, { status: 201 });
}
