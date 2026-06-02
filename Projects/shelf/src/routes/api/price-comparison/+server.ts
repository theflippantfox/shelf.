import { json } from '@sveltejs/kit';
import { adminClient } from '$lib/server/directus';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
  const { shop_id } = locals.user;
  if (!shop_id) return json({ error: 'Shop ID missing' }, { status: 400 });

  try {
    // 1. Fetch Products
    const products = await adminClient().request({
      method: 'GET',
      url: '/items/products',
      query: {
        filter: { shop: { _eq: shop_id } },
        fields: ['id', 'name', 'sku', 'cost_price']
      }
    });

    // 2. Fetch Suppliers
    const suppliers = await adminClient().request({
      method: 'GET',
      url: '/items/suppliers',
      query: {
        filter: { shop: { _eq: shop_id }, is_active: { _eq: true } },
        fields: ['id', 'name']
      }
    });

    // 3. Fetch Latest Price History
    // We want the most recent unit_cost for each product-supplier pair
    const history = await adminClient().request({
      method: 'GET',
      url: '/items/supplier_price_history',
      query: {
        filter: { shop: { _eq: shop_id } },
        fields: ['product', 'supplier', 'unit_cost', 'recorded_at', 'purchase_order'],
        sort: ['-recorded_at']
      }
    });

    // Build matrix: product_id -> supplier_id -> data
    const matrix: any = {};
    const processedPairs = new Set();

    for (const entry of history) {
      const pairKey = `${entry.product}-${entry.supplier}`;
      if (processedPairs.has(pairKey)) continue;

      if (!matrix[entry.product]) matrix[entry.product] = {};
      
      matrix[entry.product][entry.supplier] = {
        unit_cost: entry.unit_cost,
        recorded_at: entry.recorded_at,
        purchase_order_ref: entry.purchase_order
      };
      
      processedPairs.add(pairKey);
    }

    // Mark cheapest per product
    for (const productId in matrix) {
      const prices = Object.values(matrix[productId]);
      if (prices.length === 0) continue;
      
      const minCost = Math.min(...prices.map(p => p.unit_cost));
      for (const supplierId in matrix[productId]) {
        matrix[productId][supplierId].is_cheapest = matrix[productId][supplierId].unit_cost === minCost;
      }
    }

    return json({
      products,
      suppliers,
      matrix
    });
  } catch (e) {
    console.error('Price comparison error:', e);
    return json({ error: 'Failed to fetch price comparison' }, { status: 500 });
  }
};
