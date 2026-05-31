import type { Handle, HandleServerError } from '@sveltejs/kit';
import {
  validateSession, getUserById,
  SESSION_COOKIE_NAME,
} from '$lib/server/auth';
import { adminClient, readItems } from '$lib/server/directus';

const SHOP_COOKIE = 'shelf-current-shop';

export const handle: Handle = async ({ event, resolve }) => {
  event.locals.directus    = null;   // kept for compat, not used for auth
  event.locals.user        = null;
  event.locals.shopMember  = null;
  event.locals.currentShop = null;

  // ── 1. Session → User ─────────────────────────────────────────────────────
  const sessionToken = event.cookies.get(SESSION_COOKIE_NAME);
  if (sessionToken) {
    try {
      const userId = await validateSession(sessionToken);
      if (userId) {
        event.locals.user = await getUserById(userId);
      } else {
        // Expired or invalid session — clear the cookie
        event.cookies.delete(SESSION_COOKIE_NAME, { path: '/' });
      }
    } catch (err) {
      console.error('[Shëlf hooks] session validation failed:', err);
    }
  }

  // ── 2. Shop context ───────────────────────────────────────────────────────
  const isAuthPage = event.url.pathname === '/login' ||
                     event.url.pathname.startsWith('/forgot-password');

  if (event.locals.user && !isAuthPage) {
    await loadShopContext(event);
  }

  return resolve(event);
};

async function loadShopContext(event: any) {
  const admin        = adminClient();
  const userId       = event.locals.user.id;
  const cookieShopId = event.cookies.get(SHOP_COOKIE) ?? null;

  try {
    const filter: Record<string, unknown> = {
      user:   { _eq: userId },
      status: { _eq: 'active' },
    };
    if (cookieShopId) filter['shop'] = { _eq: cookieShopId };

    const members = await admin.request(readItems('shop_members', {
      filter,
      fields: ['id', 'role', 'status', 'permissions', 'shop'],
      limit:  1,
    })) as any[];

    if (!members.length) return;

    const shopId = typeof members[0].shop === 'string'
      ? members[0].shop : members[0].shop?.id;
    if (!shopId) return;

    const shops = await admin.request(readItems('shops', {
      filter: { id: { _eq: shopId } },
      limit:  1,
    })) as any[];

    if (!shops.length) return;

    event.locals.shopMember  = members[0];
    event.locals.currentShop = shops[0];

    if (!cookieShopId) {
      event.cookies.set(SHOP_COOKIE, shopId, {
        httpOnly: false, path: '/', sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 30,
      });
    }
  } catch (err) {
    console.error('[Shëlf hooks] shop context failed:', err);
  }
}

export const handleError: HandleServerError = ({ error, event }) => {
  console.error('[Shëlf]', event.url.pathname, error);
  return { message: 'An unexpected error occurred.' };
};
