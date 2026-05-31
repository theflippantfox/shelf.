import { adminClient, readItems } from '$lib/server/directus';

export async function load({ locals, url }) {
  const shopId = locals.currentShop!.id;
  const period = url.searchParams.get('period') ?? '30d';
  const client = adminClient();

  const now  = new Date();
  const from = new Date(now);
  if      (period === '7d')  from.setDate(now.getDate() - 7);
  else if (period === '30d') from.setDate(now.getDate() - 30);
  else if (period === '90d') from.setDate(now.getDate() - 90);
  else if (period === '1y')  from.setFullYear(now.getFullYear() - 1);

  const sales = await client.request(readItems('sales', {
    filter: {
      shop:         { _eq: shopId },
      voided_at:    { _null: true },
      date_created: { _gte: from.toISOString() },
    },
    fields: ['id','total','tax_amount','payment_method','date_created'],
    limit:  -1,
  })) as any[];

  const saleIds = sales.map(s => s.id);
  let topProducts: any[] = [];
  let byCategory: any[]  = [];

  if (saleIds.length > 0) {
    const saleItems = await client.request(readItems('sale_items', {
      filter: { sale: { _in: saleIds } },
      fields: ['product_name','qty','line_total','product.category.name','product.category.color'],
      limit:  -1,
    })) as any[];

    // Top products
    const prodMap: Record<string, { name: string; qty: number; revenue: number }> = {};
    const catMap:  Record<string, { name: string; color: string; revenue: number }> = {};

    for (const item of saleItems) {
      if (!prodMap[item.product_name]) prodMap[item.product_name] = { name: item.product_name, qty: 0, revenue: 0 };
      prodMap[item.product_name].qty     += item.qty;
      prodMap[item.product_name].revenue += item.line_total;

      const catName  = item.product?.category?.name  ?? 'Uncategorised';
      const catColor = item.product?.category?.color ?? '#9b8aaa';
      if (!catMap[catName]) catMap[catName] = { name: catName, color: catColor, revenue: 0 };
      catMap[catName].revenue += item.line_total;
    }

    topProducts = Object.values(prodMap).sort((a, b) => b.revenue - a.revenue).slice(0, 8);
    byCategory  = Object.values(catMap).sort((a, b) => b.revenue - a.revenue);
  }

  // Revenue by day
  const byDay: Record<string, number> = {};
  for (const s of sales) {
    const day = s.date_created.slice(0, 10);
    byDay[day] = (byDay[day] ?? 0) + s.total;
  }

  const revenueByDay = Object.entries(byDay)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, revenue]) => ({ date, revenue }));

  const byMethod = { cash: 0, credit: 0, transfer: 0 } as Record<string, number>;
  for (const s of sales) byMethod[s.payment_method] = (byMethod[s.payment_method] ?? 0) + s.total;

  return {
    period,
    totalRevenue:     sales.reduce((s, x) => s + x.total, 0),
    totalTax:         sales.reduce((s, x) => s + x.tax_amount, 0),
    transactionCount: sales.length,
    avgOrder:         sales.length ? Math.round(sales.reduce((s, x) => s + x.total, 0) / sales.length) : 0,
    revenueByDay,
    byMethod,
    topProducts,
    byCategory,
  };
}
