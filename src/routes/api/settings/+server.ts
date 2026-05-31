import { json } from '@sveltejs/kit';
import { adminClient, updateItem } from '$lib/server/directus';

export async function PATCH({ request, locals }) {
  if (!locals.currentShop || locals.shopMember?.role !== 'owner')
    return json({ error: 'Forbidden' }, { status: 403 });

  const body   = await request.json();
  const client = adminClient();

  // Whitelist updatable fields
  const allowed = [
    'name', 'timezone', 'currency_code', 'currency_symbol', 'currency_locale',
    'date_format', 'time_format', 'tax_rate', 'tax_inclusive', 'tax_name',
    'theme', 'primary_color', 'sidebar_bg', 'low_stock_threshold',
    'receipt_header', 'receipt_footer', 'country_code',
  ];
  const safe = Object.fromEntries(
    Object.entries(body).filter(([k]) => allowed.includes(k))
  );

  const shop = await client.request(updateItem('shops', locals.currentShop.id, safe));
  return json(shop);
}
