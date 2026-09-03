import { redirect } from '@sveltejs/kit';
import { userClientFromCtx } from '$lib/server/supabase';

/**
 * Team management page — owner only.
 * Lists active and invited members with profile + email (loaded via admin).
 */
export async function load({ cookies,  locals  }: import('@sveltejs/kit').RequestEvent) {
  if (!locals.currentShop) throw redirect(302, '/');
  if (!locals.shopMember || locals.shopMember.role !== 'owner')
    throw redirect(302, '/settings');

  const supabase = userClientFromCtx({ cookies } as any);
  const { data: members = [] } = await supabase
    .from('shop_members')
    .select('id, role, status, permissions, created_at, invited_at, invited_by, user:profiles!shop_members_user_id_fkey(id, first_name, last_name, avatar_url)')
    .eq('shop_id', locals.currentShop.id)
    // `invited` (i) < `active` (a) alphabetically — so invited first
    .order('status', { ascending: true })
    .order('role');

  return { members: members as any[] };
}
