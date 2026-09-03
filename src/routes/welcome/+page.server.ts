import { redirect } from '@sveltejs/kit';
import { userClientFromCtx } from '$lib/server/supabase';

export async function load({ cookies, locals  }: import('@sveltejs/kit').RequestEvent) {
  if (!locals.user) throw redirect(302, '/login');
  // Already in a shop → skip welcome
  if (locals.shopMember) throw redirect(302, '/');

  // Look for any pending invites so the welcome page can show them
  // as a "Join a shop" call-to-action. The user can see their own
  // shop_members rows even with status='invited' (RLS update).
  const supabase = userClientFromCtx({ cookies } as any);
  const { count } = await supabase
    .from('shop_members')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', locals.user.id)
    .eq('status', 'invited');

  return { user: locals.user, inviteCount: count ?? 0 };
}
