import { redirect } from '@sveltejs/kit';
import { setFormatLocale } from '$lib/utils/format';

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

  // Initialise the format utility on the server so the first paint of every
  // (app) page uses the shop's actual currency/locale instead of the default.
  // The client-side currentShop.init() call in +layout.svelte's $effect.pre
  // would only re-render after hydration, leaving the SSR HTML mismatched.
  if (shop) {
    setFormatLocale({
      timezone:   (shop as any).timezone        ?? 'UTC',
      currency:   (shop as any).currency_code   ?? 'INR',
      locale:     (shop as any).currency_locale ?? 'en-IN',
      dateFormat: (shop as any).date_format     ?? 'D MMM YYYY',
      timeFormat: (shop as any).time_format     ?? '12h',
    });
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