/**
 * /api/users — team member management.
 *
 * GET: list active + invited members of the current shop.
 *      Owners see pending invites too.
 * POST: invite an existing Shëlf user by email. Creates a shop_members
 *      row with status='invited'. The invitee accepts from /invites.
 *      Owner only.
 *
 * Note: this endpoint no longer creates a new auth user. New Shëlf users
 * sign up on their own; owners only invite people who already exist.
 */
import { json } from '@sveltejs/kit';
import { adminClient, userClient, userClientFromCtx } from '$lib/server/supabase';

export async function GET({ cookies, locals  }: import('@sveltejs/kit').RequestEvent) {
  if (!locals.currentShop) return json({ error: 'No shop' }, { status: 401 });
  const supabase = userClientFromCtx({ cookies } as any);
  const admin    = adminClient();

  const { data, error } = await supabase
    .from('shop_members')
    .select('id, role, status, permissions, created_at, invited_at, invited_by, user:profiles!shop_members_user_id_fkey(id, first_name, last_name, avatar_url)')
    .eq('shop_id', locals.currentShop.id)
    .order('status', { ascending: true })   // 'invited' before 'active' alphabetically
    .order('role');

  if (error) return json({ error: error.message }, { status: 500 });

  // Augment with emails from auth.users. PostgREST doesn't expose
  // auth.users to clients, and admin.auth.admin.listUsers is broken
  // on this local GoTrue instance. We use a SECURITY DEFINER RPC
  // (get_user_emails) restricted to service_role.
  const members = (data ?? []) as any[];
  const userIds = members.map((m) => m.user?.id).filter(Boolean);
  if (userIds.length) {
    const { data: rows } = await admin.rpc('get_user_emails', { ids: userIds });
    const emailMap: Record<string, string> = {};
    for (const u of rows ?? []) {
      emailMap[(u as any).id] = (u as any).email ?? '';
    }
    for (const m of members) {
      if (m.user?.id) m.user.email = emailMap[m.user.id] ?? '';
    }
  }

  // Augment with inviter names (profiles of invited_by ids)
  const inviterIds = [...new Set(members.map((m) => m.invited_by).filter(Boolean))];
  if (inviterIds.length) {
    const { data: profiles } = await admin
      .from('profiles')
      .select('id, first_name, last_name')
      .in('id', inviterIds);
    const nameMap: Record<string, string> = {};
    for (const p of profiles ?? []) {
      nameMap[(p as any).id] = `${(p as any).first_name ?? ''} ${(p as any).last_name ?? ''}`.trim();
    }
    for (const m of members) {
      if (m.invited_by) m.invited_by_name = nameMap[m.invited_by] ?? null;
    }
  }

  return json(members);
}

/**
 * POST /api/users — invite an existing Shëlf user by email.
 * Owner only. Email must already have a Shëlf account.
 */
export async function POST({ cookies, request, locals  }: import('@sveltejs/kit').RequestEvent) {
  if (!locals.currentShop || !locals.user)
    return json({ error: 'Unauthorized' }, { status: 401 });
  if (locals.shopMember?.role !== 'owner')
    return json({ error: 'Only owners can invite teammates' }, { status: 403 });

  const { email, role } = await request.json();
  if (!email) return json({ error: 'Email is required' }, { status: 400 });
  const cleanEmail = String(email).trim().toLowerCase();

  const admin = adminClient();

  // 1) Look up the user by email. PostgREST doesn't expose auth.users
  // directly, and admin.auth.admin.listUsers is broken on this local
  // GoTrue. Use the SECURITY DEFINER RPC find_user_id_by_email.
  const { data: userId, error: lookupErr } = await admin
    .rpc('find_user_id_by_email', { needle: cleanEmail });

  if (lookupErr) return json({ error: lookupErr.message }, { status: 500 });
  if (!userId) {
    return json(
      {
        error: 'no_user',
        message: `No Shëlf account exists for ${cleanEmail}. Ask them to sign up first, then invite them.`,
      },
      { status: 404 },
    );
  }
  const found = { id: userId as unknown as string, email: cleanEmail } as any;

  // 2) Reject if the user is already a member of this shop (any status)
  const { data: existing } = await admin
    .from('shop_members')
    .select('id, status')
    .eq('shop_id', locals.currentShop.id)
    .eq('user_id', found.id)
    .maybeSingle();

  if (existing) {
    const status = (existing as any).status;
    if (status === 'active')    return json({ error: `${cleanEmail} is already on your team.` }, { status: 409 });
    if (status === 'invited')   return json({ error: `${cleanEmail} already has a pending invite.` }, { status: 409 });
    if (status === 'suspended') return json({ error: `${cleanEmail} was removed; cancel and re-invite to restore access.` }, { status: 409 });
  }

  // 3) Insert shop_members row with status='invited'
  // If a suspended row exists, reactivate it as invited.
  const row = {
    shop_id:    locals.currentShop.id,
    user_id:    found.id,
    role:       role || 'cashier',
    status:     'invited',
    invited_by: locals.user.id,
    invited_at: new Date().toISOString(),
  };

  let data, error;
  if (existing) {
    ({ data, error } = await admin
      .from('shop_members')
      .update(row)
      .eq('id', (existing as any).id)
      .select()
      .single());
  } else {
    ({ data, error } = await admin.from('shop_members').insert(row).select().single());
  }

  if (error) return json({ error: error.message }, { status: 400 });
  return json(data, { status: 201 });
}
