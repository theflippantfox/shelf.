import { adminClient, readItems } from '$lib/server/directus';

export async function generateSku(shopId: string, name: string): Promise<string> {
  const prefix = name
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()
    .slice(0, 4)
    .padEnd(4, 'X');

  let attempt = 0;
  while (attempt < 100) {
    const rand = Math.floor(1000 + Math.random() * 9000);
    const sku  = `${prefix}-${rand}`;
    const exists = await adminClient.request(readItems('products', {
      filter: { shop: { _eq: shopId }, sku: { _eq: sku } },
      limit: 1,
    }));
    if (exists.length === 0) return sku;
    attempt++;
  }
  return `${prefix}-${Date.now().toString(36).toUpperCase()}`;
}

let _shopId = '';
let _counter = 1;
export function generateSaleRef(shopId: string): string {
  if (_shopId !== shopId) { _shopId = shopId; _counter = 1; }
  const date = new Date();
  const d = date.toISOString().slice(2, 10).replace(/-/g, '');
  return `SL${d}-${String(_counter++).padStart(4, '0')}`;
}
