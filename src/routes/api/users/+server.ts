/**
 * /api/users — team member management.
 *
 * GET: list active members of the current shop (owner + cashier etc.)
 * POST: invite a new teammate (admin creates the auth user + member row).
 */
import { json } from '@sveltejs/kit';
import { adminClient, userClient } from '$lib/server/supabase';

export async function GET({ locals }: import('@sveltejs/kit').RequestEvent) {
  if (!locals.currentShop) return json({ error: 'No shop' }, { status: 401 });
  const supabase = userClient({ locals } as any);
  const admin    = adminClient();

  const { data, error } = await supabase
    .from('shop_members')
    .select('id, role, status, permissions, created_at, user:profiles!shop_members_user_id_fkey(id, first_name, last_name, avatar_url)')
    .eq('shop_id', locals.currentShop.id)
    .order('role');

  if (error) return json({ error: error.message }, { status: 500 });

  // Augment with emails from auth.users (not joinable via typed query)
  const members = (data ?? []) as any[];
  const userIds = members.map((m) => m.user?.id).filter(Boolean);
  if (userIds.length) {
    const { data: users } = await admin.auth.admin.listUsers({ perPage: 200 });
    const emailMap: Record<string, string> = {};
    for (const u of users?.users ?? []) {
      emailMap[u.id] = u.email ?? '';
    }
    for (const m of members) {
      if (m.user?.id) m.user.email = emailMap[m.user.id] ?? '';
    }
  }

  return json(members);
}

/**
 * POST /api/users — invite a new teammate.
 * Creates the auth user (admin) + shop_members row.
 * Owner only.
 */
export async function POST({ request, locals }: import('@sveltejs/kit').RequestEvent) {
  if (!locals.currentShop || !locals.user)
    return json({ error: 'Unauthorized' }, { status: 401 });
  if (locals.shopMember?.role !== 'owner')
    return json({ error: 'Only owners can invite teammates' }, { status: 403 });

  const { first_name, email, password, role } = await request.json();
  if (!email) return json({ error: 'email is required' }, { status: 400 });
  if (password && password.length < 8)
    return json({ error: 'Password must be at least 8 characters' }, { status: 400 });

  const admin = adminClient();

  // Create auth user (email_confirm: true so the user is immediately usable;
  // a full invite flow with recovery links can be added later)
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password: password || Math.random().toString(36).slice(-10),
    email_confirm: true,
    user_metadata: { first_name: first_name || '', last_name: '' },
  });

  if (createErr || !created?.user)
    return json({ error: createErr?.message ?? 'Failed to create user' }, { status: 400 });

  const { data, error } = await admin
    .from('shop_members')
    .insert({
      shop_id: locals.currentShop.id,
      user_id: created.user.id,
      role: role || 'cashier',
      status: 'active',
    })
    .select()
    .single();

  if (error) return json({ error: error.message }, { status: 400 });
  return json(data, { status: 201 });
}