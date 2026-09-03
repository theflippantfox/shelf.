/**
 * /api/users/[id] — single member management.
 *
 * PATCH: update role / permissions. Owner only.
 * DELETE: soft-suspend an active member, OR cancel a pending invite.
 *         Owner only.
 */
import { json } from '@sveltejs/kit';
import { adminClient, userClientFromCtx } from '$lib/server/supabase';

export async function PATCH({ cookies, params, request, locals  }: import('@sveltejs/kit').RequestEvent) {
  if (!params.id) return json({ error: 'Missing id' }, { status: 400 });
  if (!locals.currentShop)
    return json({ error: 'No shop' }, { status: 401 });
  if (locals.shopMember?.role !== 'owner')
    return json({ error: 'Only owners can update team members' }, { status: 403 });

  const body = await request.json();
  const ALLOWED = ['role', 'status', 'permissions'];
  const safe: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (ALLOWED.includes(k)) safe[k] = v;
  }

  const supabase = userClientFromCtx({ cookies } as any);
  const { data, error } = await supabase
    .from('shop_members')
    .update(safe as any)
    .eq('id', params.id)
    .select()
    .single();

  if (error) return json({ error: error.message }, { status: 400 });
  return json(data);
}

export async function DELETE({ cookies, params, locals  }: import('@sveltejs/kit').RequestEvent) {
  if (!params.id) return json({ error: 'Missing id' }, { status: 400 });
  if (!locals.currentShop)
    return json({ error: 'No shop' }, { status: 401 });
  if (locals.shopMember?.role !== 'owner')
    return json({ error: 'Only owners can remove team members' }, { status: 403 });

  // Look up the row to decide cancel-vs-suspend.
  // Use admin to bypass any RLS quirks (we already owner-gated above).
  const admin = adminClient();
  const { data: row, error: lookupErr } = await admin
    .from('shop_members')
    .select('id, status')
    .eq('id', params.id)
    .single();
  if (lookupErr || !row) return json({ error: 'Member not found' }, { status: 404 });

  // Invited: hard-delete (so the email can be re-invited cleanly).
  if ((row as any).status === 'invited') {
    const { error: delErr } = await admin
      .from('shop_members')
      .delete()
      .eq('id', params.id);
    if (delErr) return json({ error: delErr.message }, { status: 400 });
    return json({ cancelled: true });
  }

  // Active: soft-suspend.
  const { data, error } = await admin
    .from('shop_members')
    .update({ status: 'suspended' })
    .eq('id', params.id)
    .select()
    .single();
  if (error) return json({ error: error.message }, { status: 400 });
  return json(data);
}
