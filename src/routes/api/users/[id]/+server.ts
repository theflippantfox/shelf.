/**
 * /api/users/[id] — single member management.
 *
 * PATCH: update role / status / permissions. Owner only.
 * DELETE: soft-delete via status='suspended'. Owner only.
 */
import { json } from '@sveltejs/kit';
import { userClient, userClientFromCtx } from '$lib/server/supabase';

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

  // Soft delete — set status to 'suspended'
  const supabase = userClientFromCtx({ cookies } as any);
  const { data, error } = await supabase
    .from('shop_members')
    .update({ status: 'suspended' })
    .eq('id', params.id)
    .select()
    .single();

  if (error) return json({ error: error.message }, { status: 400 });
  return json(data);
}