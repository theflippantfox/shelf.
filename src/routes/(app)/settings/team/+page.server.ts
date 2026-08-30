import { redirect } from '@sveltejs/kit';
import { userClient } from '$lib/server/supabase';

/**
 * Team management page — owner only.
 * Lists members with profile + email (loaded separately via admin API).
 */
export async function load({ locals }: import('@sveltejs/kit').RequestEvent) {
  if (!locals.currentShop) throw redirect(302, '/');
  if (!locals.shopMember || locals.shopMember.role !== 'owner')
    throw redirect(302, '/settings');

  const supabase = userClient({ locals } as any);
  const { data: members = [] } = await supabase
    .from('shop_members')
    .select('id, role, status, permissions, created_at, user:profiles!shop_members_user_id_fkey(id, first_name, last_name, avatar_url)')
    .eq('shop_id', locals.currentShop.id)
    .order('role');

  return { members: members as any[] };
}