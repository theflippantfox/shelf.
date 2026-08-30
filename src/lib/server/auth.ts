/**
 * Auth helpers — Supabase Auth replaces the old custom bcrypt+sessions flow.
 *
 * Identity: auth.users (Supabase). Profiles auto-created via DB trigger (see 0001_init.sql).
 * Sessions: handled by Supabase Auth via cookies (set/read by @supabase/ssr in hooks.server.ts).
 *
 * NEVER use these from the browser. The admin client has service-role privileges.
 */
import type { RequestEvent } from '@sveltejs/kit';
import { error } from '@sveltejs/kit';
import { adminClient, userClient } from './supabase';
import type { Database } from '$lib/types/db';

export type Profile = Database['public']['Tables']['profiles']['Row'];
export type Shop = Database['public']['Tables']['shops']['Row'];
export type ShopMember = Database['public']['Tables']['shop_members']['Row'];

// =========================================================================
// Server-side signup
// =========================================================================

/**
 * Create a new auth user. The profiles row is auto-created by the
 * on_auth_user_created trigger in the database.
 *
 * @returns the new user's auth id
 */
export async function signUp(
  email: string,
  password: string,
  firstName: string,
  lastName: string
): Promise<string> {
  const admin = adminClient();
  const { data, error: err } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,             // skip confirmation email; user is active immediately
    user_metadata: { first_name: firstName, last_name: lastName },
  });
  if (err) throw err;
  return data.user.id;
}

// =========================================================================
// Membership lookup
// =========================================================================

/**
 * Load the active shop membership for a user.
 * If shopIdHint is given, prefer that shop; otherwise pick the first active membership.
 *
 * @returns { profile, shop, member } or null if the user has no active shop.
 */
export async function getActiveMembership(userId: string, shopIdHint?: string | null) {
  const admin = adminClient();

  let q = admin
    .from('shop_members')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .limit(1);
  if (shopIdHint) q = q.eq('shop_id', shopIdHint);

  const { data: members, error: mErr } = await q;
  if (mErr) throw mErr;
  const member = members?.[0];
  if (!member) return null;

  const [{ data: shop, error: sErr }, { data: profile, error: pErr }] = await Promise.all([
    admin.from('shops').select('*').eq('id', member.shop_id).single(),
    admin.from('profiles').select('*').eq('id', userId).single(),
  ]);
  if (sErr) throw sErr;
  if (pErr) throw pErr;
  if (!shop || !profile) return null;

  return { profile, shop, member };
}

// =========================================================================
// Team invites
// =========================================================================

/**
 * Invite a teammate by email. Uses Supabase Auth invite (sends email via Supabase).
 *
 * @returns the new user's auth id
 */
export async function inviteTeammate(
  email: string,
  role: 'owner' | 'manager' | 'cashier',
  shopId: string,
  redirectTo?: string
): Promise<string> {
  const admin = adminClient();

  const { data, error: err } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo,
  });
  if (err) throw err;
  const userId = data.user.id;

  // profiles row is auto-created by trigger; shop_members row we add explicitly
  const { error: mErr } = await admin.from('shop_members').insert({
    shop_id: shopId,
    user_id: userId,
    role,
    status: 'invited',
  });
  if (mErr) throw mErr;

  return userId;
}

// =========================================================================
// Convenience helpers for API routes
// =========================================================================

/**
 * Get the auth user from the request event. Returns null if not signed in.
 * Use userClient so the session cookie is respected (RLS-correct).
 */
export async function getCurrentUser(event: RequestEvent) {
  const supabase = userClient(event);
  const { data, error: err } = await supabase.auth.getUser();
  if (err) return null;
  return data.user;
}

/**
 * Require a signed-in user. Returns the auth user, or throws a 401 Response.
 */
export async function requireUser(event: RequestEvent) {
  const user = await getCurrentUser(event);
  if (!user) throw error(401, 'Not signed in');
  return user;
}