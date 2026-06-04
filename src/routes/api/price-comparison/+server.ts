import { json } from '@sveltejs/kit';
import { adminClient, readItems } from '$lib/server/directus';

export async function GET({ locals, url }) {
  if (!locals.currentShop) return json({ error: 'No shop' }, { status: 401 });
  const shopId = locals.currentShop.id;
  
  const client = adminClient();
  
  // 1. Fetch all active products for the shop
  const products = await client.request(readItems('products', {
    filter: { shop: { _eq: shopId }, archived_at: { _null: true } },
    fields: ['id', 'name', 'sku', 'cost_price'],
    limit: -1,
  }));

  // 2. Fetch all active suppliers for the shop
  const suppliers = await client.request(readItems('suppliers', {
    filter: { shop: { _eq: shopId }, is_active: { _eq: true } },
    fields: ['id', 'name'],
    limit: -1,
  }));

  // 3. Fetch latest prices per product/supplier pair
  // Directus doesn't have a 'DISTINCT ON' helper in the standard readItems filter.
  // We fetch all price history for the shop and reduce in-memory.
  const history = await client.request(readItems('supplier_price_history', {
    filter: { shop: { _eq: shopId } },
    sort: ['-recorded_at'],
    limit: -1,
  }));

  const matrix: Record<string, Record<string, any>> = {};
  const productMap = new Map(products.map(p => [p.id, p]));
  
  // Since history is sorted by -recorded_at, the first time we see a product-supplier pair, it's the latest.
  const seen = new Set();
  for (const record of history) {
    const key = `${record.product}_${record.supplier}`;
    if (seen.has(key)) continue;
    seen.add(key);

    if (!matrix[record.product]) matrix[record.product] = {};
    matrix[record.product][record.supplier] = {
      unit_cost: record.unit_cost,
      recorded_at: record.recorded_at,
      purchase_order_ref: record.purchase_order,
    };
  }

  // Determine cheapest for each product
  for (const prodId in matrix) {
    const prices = Object.values(matrix[prodId]);
    if (prices.length === 0) continue;
    
    const minCost = Math.min(...prices.map(p => p.unit_cost));
    for (const supId in matrix[prodId]) {
      matrix[prodId][supId].is_cheapest = (matrix[prodId][supId].unit_cost === minCost);
    }
  }

  return json({
    products: products.map(p => ({
      id: p.id,
      name: p.name,
      sku: p.sku,
      current_cost_price: p.cost_price
    })),
    suppliers: suppliers.map(s => ({
      id: s.id,
      name: s.name
    })),
    matrix
  });
}
