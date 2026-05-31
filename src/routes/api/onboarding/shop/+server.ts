import { json }     from '@sveltejs/kit';
import { adminClient, createItem, readItems } from '$lib/server/directus';

const SHOP_COOKIE = 'shelf-current-shop';

export async function POST({ request, locals, cookies }) {
  if (!locals.user) return json({ error: 'Not authenticated' }, { status: 401 });
  const { name, slug } = await request.json();
  if (!name) return json({ error: 'Shop name required' }, { status: 400 });

  const client = adminClient();

  // Slug — unique, lowercase, hyphens only
  const finalSlug = (slug || name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

  const existing = await client.request(
    readItems('shops', { filter: { slug: { _eq: finalSlug } }, limit: 1 })
  );
  if (existing.length > 0)
    return json({ error: 'That handle is already taken' }, { status: 409 });

  const shop = await client.request(createItem('shops', {
    name,
    slug:                finalSlug,
    currency_code:       'USD',
    currency_symbol:     '$',
    currency_locale:     'en-US',
    timezone:            'UTC',
    date_format:         'D MMM YYYY',
    time_format:         '12h',
    tax_rate:            0,
    tax_inclusive:       false,
    tax_name:            'Tax',
    theme:               'system',
    primary_color:       '#7B4F8A',
    sidebar_bg:          '#150F1C',
    onboarding_complete: false,
    onboarding_step:     'locale',
    low_stock_threshold: 10,
  })) as any;

  await client.request(createItem('shop_members', {
    shop:   shop.id,
    user:   locals.user.id,
    role:   'owner',
    status: 'active',
  }));

  // ✅ Fix 1: pin this shop immediately so hooks.server.ts finds it on
  //    every subsequent request, including the rest of onboarding.
  cookies.set(SHOP_COOKIE, shop.id, {
    httpOnly: false,   // needs to be readable by client redirects too
    path:     '/',
    sameSite: 'lax',
    maxAge:   60 * 60 * 24 * 30,
  });

  return json({ shopId: shop.id }, { status: 201 });
}
