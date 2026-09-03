import { redirect } from '@sveltejs/kit';
import { userClientFromCtx, adminClient } from '$lib/server/supabase';

/**
 * Onboarding "team" step — now shows pending invites for the current user.
 * (The legacy "create new auth users" flow was removed: owners invite
 * existing Shëlf users from /settings/team.)
 */
export async function load({ cookies, locals  }: import('@sveltejs/kit').RequestEvent) {
  if (!locals.user) throw redirect(302, '/login');

  const supabase = userClientFromCtx({ cookies } as any);
  const { data: invites = [] } = await supabase
    .from('shop_members')
    .select(`
      id, role, invited_at,
      shop:shops!shop_members_shop_id_fkey(id, name, slug),
      inviter:profiles!shop_members_invited_by_fkey(id, first_name, last_name)
    `)
    .eq('user_id', locals.user.id)
    .eq('status', 'invited')
    .order('invited_at', { ascending: false });

  return { invites: invites as any[] };
}
