import type { Handle } from '@sveltejs/kit';
import { userClient } from '$lib/server/supabase';
import { getActiveMembership } from '$lib/server/auth';

const SHOP_COOKIE = 'shelf-current-shop';

export const handle: Handle = async ({ event, resolve }) => {
  event.locals.user = null;
  event.locals.shopMember = null;
  event.locals.currentShop = null;

  // 1. Resolve auth user from cookie session
  const supabase = userClient(event);
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    // 2. Load the user's active shop membership
    const shopIdHint = event.cookies.get(SHOP_COOKIE);
    const ctx = await getActiveMembership(user.id, shopIdHint);

    if (ctx) {
      event.locals.user        = ctx.profile;
      event.locals.shopMember  = ctx.member;
      event.locals.currentShop = ctx.shop;

      // 3. Persist the shop cookie if it wasn't set
      if (!shopIdHint) {
        event.cookies.set(SHOP_COOKIE, ctx.shop.id, {
          httpOnly: false,
          path: '/',
          sameSite: 'lax',
          maxAge: 60 * 60 * 24 * 30,
        });
      }
    }
  }

  return resolve(event);
};