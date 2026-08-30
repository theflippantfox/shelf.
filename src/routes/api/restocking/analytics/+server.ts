/**
 * /api/restocking/analytics — restocking dashboard data.
 * Pure data fetch + JS aggregation.
 */
import { json } from '@sveltejs/kit';
import { userClient } from '$lib/server/supabase';

export async function GET({ locals, url }: import('@sveltejs/kit').RequestEvent) {
  if (!locals.currentShop) return json({ error: 'No shop' }, { status: 401 });
  const shopId = locals.currentShop.id;

  const period = url.searchParams.get('period') ?? '30d';
  const now = new Date();
  const startDate = new Date();
  if      (period === '7d')  startDate.setDate(now.getDate() - 7);
  else if (period === '90d') startDate.setDate(now.getDate() - 90);
  else                       startDate.setDate(now.getDate() - 30);
  const startDateIso = startDate.toISOString();

  const supabase = userClient({ locals } as any);

  // 1. Received POs in period
  const { data: receivedOrdersRaw = [] } = await supabase
    .from('purchase_orders')
    .select('id, total_cost, supplier_id')
    .eq('shop_id', shopId)
    .eq('status', 'received')
    .gte('created_at', startDateIso);
  const receivedOrders = receivedOrdersRaw as any[];

  const totalInvestment = (receivedOrders as any[]).reduce(
    (sum, o) => sum + (o.total_cost || 0), 0
  );
  const totalOrders = receivedOrders.length;

  // 2. Investment by supplier
  const { data: suppliers = [] } = await supabase
    .from('suppliers')
    .select('id, name')
    .eq('shop_id', shopId);

  const bySupplier = (suppliers as any[])
    .map((s) => {
      const sOrders = (receivedOrders as any[]).filter((o) => o.supplier_id === s.id);
      const total = sOrders.reduce((sum, o) => sum + (o.total_cost || 0), 0);
      return { supplier: s.name, total, order_count: sOrders.length };
    })
    .filter((b) => b.total > 0);

  // 3. Top restocked products
  const { data: poItems = [] } = await supabase
    .from('purchase_order_items')
    .select('product_id, quantity_received, unit_cost')
    .in('purchase_order_id', receivedOrders.map((o: any) => o.id));

  const { data: products = [] } = await supabase
    .from('products')
    .select('id, name')
    .eq('shop_id', shopId);

  const productMap = new Map((products as any[]).map((p) => [p.id, p.name]));
  const productTally: Record<string, { name: string; units: number; cost: number }> = {};
  for (const item of poItems as any[]) {
    if (!item.product_id) continue;
    if (!productTally[item.product_id]) {
      productTally[item.product_id] = {
        name: productMap.get(item.product_id) || 'Unknown',
        units: 0,
        cost: 0,
      };
    }
    productTally[item.product_id].units += item.quantity_received ?? 0;
    productTally[item.product_id].cost  += (item.quantity_received ?? 0) * (item.unit_cost ?? 0);
  }
  const topRestockedProducts = Object.values(productTally)
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 5);

  // 4. Pending orders value
  const { data: pendingOrders = [] } = await supabase
    .from('purchase_orders')
    .select('total_cost')
    .eq('shop_id', shopId)
    .in('status', ['draft', 'ordered']);

  const pendingOrdersValue = (pendingOrders as any[]).reduce(
    (sum, o) => sum + (o.total_cost || 0), 0
  );

  return json({
    totalInvestment,
    totalOrders,
    bySupplier,
    topRestockedProducts,
    pendingOrdersValue,
  });
}