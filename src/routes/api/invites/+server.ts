/**
 * /api/invites — invitee side of the team flow.
 *
 * GET: list pending invites for the current user across all shops.
 * POST: accept or decline a specific invite.
 *       body: { shop_member_id, action: 'accept' | 'decline' }
 */
import { json } from '@sveltejs/kit';
import { adminClient, userClient, userClientFromCtx } from '$lib/server/supabase';

export async function GET({ cookies, locals  }: import('@sveltejs/kit').RequestEvent) {
  if (!locals.user) return json({ error: 'Not signed in' }, { status: 401 });

  // The user can see their own row even before accepting (RLS update).
  const supabase = userClientFromCtx({ cookies } as any);
  const { data, error } = await supabase
    .from('shop_members')
    .select(`
      id, role, invited_at, shop_id,
      shop:shops!shop_members_shop_id_fkey(id, name, slug),
      inviter:profiles!shop_members_invited_by_fkey(id, first_name, last_name)
    `)
    .eq('user_id', locals.user.id)
    .eq('status', 'invited')
    .order('invited_at', { ascending: false });

  if (error) return json({ error: error.message }, { status: 500 });
  return json(data ?? []);
}

export async function POST({ cookies, request, locals  }: import('@sveltejs/kit').RequestEvent) {
  if (!locals.user) return json({ error: 'Not signed in' }, { status: 401 });

  const { shop_member_id, action } = await request.json();
  if (!shop_member_id || !action)
    return json({ error: 'shop_member_id and action are required' }, { status: 400 });
  if (action !== 'accept' && action !== 'decline')
    return json({ error: 'action must be "accept" or "decline"' }, { status: 400 });

  // RLS allows the invitee to update their own row when status='invited',
  // restricting new status to 'active' or 'suspended'.
  const supabase = userClientFromCtx({ cookies } as any);
  const newStatus = action === 'accept' ? 'active' : 'suspended';

  const { data, error } = await supabase
    .from('shop_members')
    .update({ status: newStatus })
    .eq('id', shop_member_id)
    .eq('user_id', locals.user.id)   // belt-and-suspenders: only own row
    .eq('status', 'invited')         // can't act on already-accepted
    .select(`
      id, role, status, shop_id,
      shop:shops!shop_members_shop_id_fkey(id, name, slug)
    `)
    .single();

  if (error) return json({ error: error.message }, { status: 400 });
  return json(data);
}
