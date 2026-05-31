import { json } from '@sveltejs/kit';
import { adminClient, readItems } from '$lib/server/directus';

export async function GET({ locals, url }) {
  if (!locals.currentShop) return json({ error: 'No shop' }, { status: 401 });
  const shopId  = locals.currentShop.id;
  const period  = url.searchParams.get('period') ?? '30d';
  const client  = adminClient();

  const now   = new Date();
  const from  = new Date(now);
  if (period === '7d')  from.setDate(now.getDate() - 7);
  else if (period === '30d') from.setDate(now.getDate() - 30);
  else if (period === '90d') from.setDate(now.getDate() - 90);
  else if (period === '1y')  from.setFullYear(now.getFullYear() - 1);

  const sales = await client.request(readItems('sales', {
    filter: {
      shop:        { _eq: shopId },
      voided_at:   { _null: true },
      date_created: { _gte: from.toISOString() },
    },
    fields: ['id','total','subtotal','tax_amount','date_created','payment_method','customer'],
    limit:  -1,
  })) as any[];

  const totalRevenue    = sales.reduce((s, x) => s + x.total, 0);
  const totalTax        = sales.reduce((s, x) => s + x.tax_amount, 0);
  const transactionCount = sales.length;
  const avgOrder        = transactionCount ? Math.round(totalRevenue / transactionCount) : 0;

  // Revenue by day
  const byDay: Record<string, number> = {};
  for (const sale of sales) {
    const day = sale.date_created.slice(0, 10);
    byDay[day] = (byDay[day] ?? 0) + sale.total;
  }

  // By payment method
  const byMethod: Record<string, number> = { cash: 0, credit: 0, transfer: 0 };
  for (const sale of sales) {
    byMethod[sale.payment_method] = (byMethod[sale.payment_method] ?? 0) + sale.total;
  }

  // Top products from sale_items
  const saleIds   = sales.map((s: any) => s.id);
  let topProducts: any[] = [];
  if (saleIds.length > 0) {
    const items = await client.request(readItems('sale_items', {
      filter: { sale: { _in: saleIds } },
      fields: ['product_name','qty','line_total'],
      limit:  -1,
    })) as any[];

    const prodMap: Record<string, { name: string; qty: number; revenue: number }> = {};
    for (const item of items) {
      if (!prodMap[item.product_name]) prodMap[item.product_name] = { name: item.product_name, qty: 0, revenue: 0 };
      prodMap[item.product_name].qty     += item.qty;
      prodMap[item.product_name].revenue += item.line_total;
    }
    topProducts = Object.values(prodMap).sort((a, b) => b.revenue - a.revenue).slice(0, 10);
  }

  return json({
    totalRevenue,
    totalTax,
    transactionCount,
    avgOrder,
    byDay:      Object.entries(byDay).sort(([a],[b]) => a.localeCompare(b)).map(([date, revenue]) => ({ date, revenue })),
    byMethod,
    topProducts,
  });
}
