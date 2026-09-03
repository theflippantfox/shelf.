/**
 * /api/cash-register/[id] — void a manual entry.
 *
 * Only manual entries can be voided via this path. Sale entries go
 * through void_sale() (which handles the paired register writes).
 */
import { json } from '@sveltejs/kit';
import { userClientFromCtx } from '$lib/server/supabase';

export async function PATCH({ cookies, params, request, locals }: import('@sveltejs/kit').RequestEvent) {
  if (!locals.currentShop || !locals.user) {
    return json({ error: 'No shop' }, { status: 401 });
  }
  if (!params.id) return json({ error: 'Missing id' }, { status: 400 });

  // Owner/manager only — voiding is a privileged op
  const { data: member, error: memberErr } = await userClientFromCtx({ cookies } as any)
    .from('shop_members')
    .select('role, status')
    .eq('shop_id', locals.currentShop.id)
    .eq('user_id', locals.user.id)
    .single();
  if (memberErr || !member) return json({ error: 'No membership' }, { status: 403 });
  if ((member as any).status !== 'active') return json({ error: 'Membership is not active' }, { status: 403 });
  if ((member as any).role === 'cashier') return json({ error: 'Only owners and managers can void' }, { status: 403 });

  const body = await request.json();
  const reason = (body?.void_reason ?? '').toString();
  if (!reason.trim()) return json({ error: 'void_reason is required' }, { status: 400 });

  const { error } = await userClientFromCtx({ cookies } as any).rpc('void_register_entry', {
    p_entry_id: params.id,
    p_actor_id: locals.user.id,
    p_reason: reason,
  });
  if (error) return json({ error: error.message }, { status: 400 });
  return json({ ok: true });
}
