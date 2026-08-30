import { adminClient } from '$lib/server/supabase';

/**
 * Generate a SKU for a new product.
 * Format: ABCD-1234 where ABCD is the first 4 alphanumeric chars of the name.
 */
export async function generateSku(shopId: string, name: string): Promise<string> {
  const prefix = name
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()
    .slice(0, 4)
    .padEnd(4, 'X');

  const admin = adminClient();

  for (let attempt = 0; attempt < 100; attempt++) {
    const rand = Math.floor(1000 + Math.random() * 9000);
    const sku  = `${prefix}-${rand}`;
    const { data } = await admin
      .from('products')
      .select('id')
      .eq('shop_id', shopId)
      .eq('sku', sku)
      .limit(1);
    if (!data || data.length === 0) return sku;
  }

  // Fallback with timestamp
  return `${prefix}-${Date.now().toString(36).toUpperCase()}`;
}

let _shopId = '';
let _counter = 1;

/**
 * Generate a human-readable sale reference.
 * Format: SLyymmdd-NNNN (sequential per shop per day).
 */
export function generateSaleRef(shopId: string): string {
  if (_shopId !== shopId) { _shopId = shopId; _counter = 1; }
  const date = new Date();
  const d = date.toISOString().slice(2, 10).replace(/-/g, '');
  return `SL${d}-${String(_counter++).padStart(4, '0')}`;
}