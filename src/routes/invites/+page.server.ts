import { redirect } from '@sveltejs/kit';
import { userClientFromCtx } from '$lib/server/supabase';
import { adminClient } from '$lib/server/supabase';

/**
 * /invites — pending team invites for the current user.
 *
 * The user can be invited to multiple shops; we list them all and
 * let the user accept or decline each. The page is reachable:
 *   - During onboarding (inserted between shop setup and categories)
 *   - From the header bell icon
 *   - From a direct URL
 *
 * Accepting an invite flips shop_members.status to 'active'. After
 * accept the user has the shop in their switcher.
 */
export async function load({ cookies, locals  }: import('@sveltejs/kit').RequestEvent) {
  if (!locals.user) throw redirect(302, '/login');

  const supabase = userClientFromCtx({ cookies } as any);
  const { data: invites = [], error } = await supabase
    .from('shop_members')
    .select(`
      id, role, invited_at, shop_id,
      shop:shops!shop_members_shop_id_fkey(id, name, slug, currency_code, currency_symbol),
      inviter:profiles!shop_members_invited_by_fkey(id, first_name, last_name)
    `)
    .eq('user_id', locals.user.id)
    .eq('status', 'invited')
    .order('invited_at', { ascending: false });

  // Augment with inviter emails for the UI ("Invited by ..." text)
  const admin = adminClient();
  const inviterIds = [...new Set((invites as any[]).map((i) => i.inviter?.id).filter(Boolean))];
  let emailMap: Record<string, string> = {};
  if (inviterIds.length) {
    // Use the SECURITY DEFINER RPC since PostgREST doesn't expose auth.users
    // and admin.auth.admin.listUsers is broken on this local GoTrue.
    const { data: rows } = await admin.rpc('get_user_emails', { ids: inviterIds });
    for (const u of rows ?? []) {
      emailMap[(u as any).id] = (u as any).email ?? '';
    }
  }
  const enriched = (invites as any[]).map((i) => ({
    ...i,
    inviter: i.inviter
      ? { ...i.inviter, email: emailMap[i.inviter.id] ?? '' }
      : null,
  }));

  return { invites: enriched };
}
