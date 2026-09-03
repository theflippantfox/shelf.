/**
 * /api/cash-register/transfer — move money between destinations.
 *
 * POST body: { from: 'counter'|'bank'|'other', to: ..., amount: number, notes?: string, effective_at?: ISO }
 *
 * Records as a paired IN/OUT set sharing a transfer_group_id. Net
 * effect on the shop total is zero; only the per-destination balance
 * changes.
 */
import { json } from '@sveltejs/kit';
import { userClientFromCtx } from '$lib/server/supabase';

export async function POST({ cookies, request, locals }: import('@sveltejs/kit').RequestEvent) {
  if (!locals.currentShop || !locals.user) {
    return json({ error: 'No shop' }, { status: 401 });
  }

  // Owner/manager only — transfers move real money between drawers
  const { data: member, error: memberErr } = await userClientFromCtx({ cookies } as any)
    .from('shop_members')
    .select('role, status')
    .eq('shop_id', locals.currentShop.id)
    .eq('user_id', locals.user.id)
    .single();
  if (memberErr || !member) return json({ error: 'No membership' }, { status: 403 });
  if ((member as any).status !== 'active') return json({ error: 'Membership is not active' }, { status: 403 });
  if ((member as any).role === 'cashier') return json({ error: 'Only owners and managers can transfer' }, { status: 403 });

  const body = await request.json();
  const { from, to, amount, notes, effective_at } = body ?? {};
  if (!from || !to) return json({ error: 'from and to are required' }, { status: 400 });
  if (!['counter','bank','other'].includes(from) || !['counter','bank','other'].includes(to)) {
    return json({ error: 'Invalid destination' }, { status: 400 });
  }
  if (from === to) return json({ error: 'Cannot transfer to the same destination' }, { status: 400 });
  if (typeof amount !== 'number' || isNaN(amount) || amount <= 0) {
    return json({ error: 'amount must be a positive number' }, { status: 400 });
  }

  const { error } = await userClientFromCtx({ cookies } as any).rpc('transfer_register', {
    p_shop_id: locals.currentShop.id,
    p_from: from,
    p_to: to,
    p_amount: amount,
    p_notes: notes ?? '',
    p_actor_id: locals.user.id,
    p_effective_at: effective_at ?? null,
  });
  if (error) return json({ error: error.message }, { status: 400 });
  return json({ ok: true });
}
