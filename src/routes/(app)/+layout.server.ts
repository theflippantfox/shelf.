import { redirect } from '@sveltejs/kit';

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

  // Genuinely no shop yet — send to welcome
  if (!locals.shopMember) {
    throw redirect(302, '/welcome');
  }

  // Shop exists but onboarding incomplete
  const shop = locals.currentShop;
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