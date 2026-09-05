import { redirect } from '@sveltejs/kit';
import { setFormatLocale } from '$lib/utils/format';
import { userClientFromCtx } from '$lib/server/supabase';

const ONBOARDING_STEPS: Record<string, string> = {
  account:    '/onboarding/account',
  shop:       '/onboarding/shop',
  locale:     '/onboarding/locale',
  appearance: '/onboarding/appearance',
  team:       '/onboarding/team',
  categories: '/onboarding/categories',
  complete:   '/onboarding/complete',
};

export async function load({ cookies, locals, url }) {
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
    // Pre-fetch the products so the inventory store can be
    // hydrated at the layout level (the dashboard and any other
    // page that derives from invStore.outOfStock / lowStock
    // depends on this; without the layout-level seed those
    // derived values would be empty on first render and only
    // populate after the user navigated to /inventory).
    allProducts: (await (async () => {
      const supabase = userClientFromCtx({ cookies } as any);
      const { data } = await supabase
        .from('products')
        .select('id, name, sku, price, cost_price, qty, low_stock_threshold, track_stock, track_barcode, barcode, image_url, archived_at, category_id, category:categories(id, name, color, icon)')
        .eq('shop_id', shop!.id)
        .is('archived_at', null)
        .limit(1000);
      return data ?? [];
    })()),
    customers: (await (async () => {
      const supabase = userClientFromCtx({ cookies } as any);
      const { data } = await supabase
        .from('customers')
        .select('id, name, phone, email, outstanding_balance')
        .eq('shop_id', shop!.id)
        .order('name', { ascending: true })
        .limit(1000);
      return data ?? [];
    })()),
  };
}