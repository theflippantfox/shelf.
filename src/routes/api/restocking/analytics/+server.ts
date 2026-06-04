import { json } from '@sveltejs/kit';
import { adminClient, readItems } from '$lib/server/directus';

export async function GET({ locals, url }) {
  if (!locals.currentShop) return json({ error: 'No shop' }, { status: 401 });
  const shopId = locals.currentShop.id;
  
  const period = url.searchParams.get('period') ?? '30d';
  const now = new Date();
  const startDate = new Date();
  
  if (period === '7d') startDate.setDate(now.getDate() - 7);
  else if (period === '30d') startDate.setDate(now.getDate() - 30);
  else if (period === '90d') startDate.setDate(now.getDate() - 90);
  else startDate.setDate(now.getDate() - 30);

  const startDateIso = startDate.toISOString();

  const client = adminClient();
  
  // 1. Total Investment (sum of total_cost for 'received' POs)
  const receivedOrders = await client.request(readItems('purchase_orders', {
    filter: { 
      shop: { _eq: shopId }, 
      status: { _eq: 'received' }, 
      date_created: { _gte: startDateIso } 
    },
    fields: ['total_cost'],
    limit: -1,
  }));

  const totalInvestment = receivedOrders.reduce((sum: number, o: any) => sum + (o.total_cost || 0), 0);
  const totalOrders = receivedOrders.length;

  // 2. Investment by Supplier
  const suppliers = await client.request(readItems('suppliers', {
    filter: { shop: { _eq: shopId } },
    fields: ['id', 'name'],
    limit: -1,
  }));

  const bySupplier: any[] = [];
  for (const s of suppliers) {
    const sOrders = receivedOrders.filter(o => o.supplier === s.id);
    const sTotal = sOrders.reduce((sum: number, o: any) => sum + (o.total_cost || 0), 0);
    if (sTotal > 0) {
      bySupplier.push({
        supplier: s.name,
        total: sTotal,
        order_count: sOrders.length,
      });
    }
  }

  // 3. Top Restocked Products
  const poItems = await client.request(readItems('purchase_order_items', {
    filter: { 
      purchase_order: { 
        _in: receivedOrders.map(o => o.id) 
      } 
    },
    fields: ['product', 'quantity_received', 'unit_cost'],
    limit: -1,
  }));

  const productTally: Record<string, { name: string, units: number, cost: number }> = {};
  const products = await client.request(readItems('products', {
    filter: { shop: { _eq: shopId } },
    fields: ['id', 'name'],
    limit: -1,
  }));

  for (const item of poItems) {
    if (!productTally[item.product]) {
      const p = products.find(prod => prod.id === item.product);
      productTally[item.product] = { 
        name: p?.name || 'Unknown', 
        units: 0, 
        cost: 0 
      };
    }
    productTally[item.product].units += item.quantity_received;
    productTally[item.product].cost += (item.quantity_received * item.unit_cost);
  }

  const topRestockedProducts = Object.values(productTally)
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 5);

  // 4. Pending Orders Value
  const pendingOrders = await client.request(readItems('purchase_orders', {
    filter: { 
      shop: { _eq: shopId }, 
      status: { _in: ['draft', 'ordered'] } 
    },
    fields: ['total_cost'],
    limit: -1,
  }));

  const pendingOrdersValue = pendingOrders.reduce((sum: number, o: any) => sum + (o.total_cost || 0), 0);

  return json({
    totalInvestment,
    totalOrders,
    bySupplier,
    topRestockedProducts,
    pendingOrdersValue,
  });
}
