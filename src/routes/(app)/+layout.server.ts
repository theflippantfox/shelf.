import { redirect }     from '@sveltejs/kit';
import { adminClient, readItems } from '$lib/server/directus';

const ONBOARDING_STEPS: Record<string, string> = {
  account:    '/onboarding/account',
  shop:       '/onboarding/shop',
  locale:     '/onboarding/locale',
  appearance: '/onboarding/appearance',
  team:       '/onboarding/team',
  categories: '/onboarding/categories',
  complete:   '/onboarding/complete',
};

export async function load({ locals, url }) {
  if (!locals.user) {
    throw redirect(302, `/login?next=${encodeURIComponent(url.pathname)}`);
  }

  // Fallback: hooks may have skipped shop context (e.g. first request after login)
  if (!locals.shopMember) {
    await fallbackShopLoad(locals);
  }

  // Genuinely no shop yet
  if (!locals.shopMember) {
    throw redirect(302, '/welcome');
  }

  // Shop exists but onboarding incomplete
  const shop = locals.currentShop as any;
  if (shop && !shop.onboarding_complete) {
    const step    = shop.onboarding_step ?? 'shop';
    const stepUrl = ONBOARDING_STEPS[step] ?? '/onboarding/shop';
    if (!url.pathname.startsWith('/onboarding')) throw redirect(302, stepUrl);
  }

  return {
    user:        locals.user,
    shopMember:  locals.shopMember,
    currentShop: locals.currentShop,
    perms: {
      role:        locals.shopMember!.role,
      permissions: (locals.shopMember as any).permissions ?? {},
    },
  };
}

async function fallbackShopLoad(locals: App.Locals) {
  if (!locals.user) return;
  try {
    const admin   = adminClient();
    const members = await admin.request(readItems('shop_members', {
      filter: { user: { _eq: locals.user.id }, status: { _eq: 'active' } },
      fields: ['id', 'role', 'status', 'permissions', 'shop'],
      limit:  1,
    })) as any[];
    if (!members.length) return;

    const shopId = typeof members[0].shop === 'string' ? members[0].shop : members[0].shop?.id;
    if (!shopId) return;

    const shops = await admin.request(readItems('shops', {
      filter: { id: { _eq: shopId } }, limit: 1,
    })) as any[];
    if (!shops.length) return;

    locals.shopMember  = members[0];
    locals.currentShop = shops[0];
  } catch (err) {
    console.error('[Shëlf layout fallback]', err);
  }
}
