import { adminClient, readItems } from '$lib/server/directus';

export async function load({ locals }) {
  const shopId  = locals.currentShop!.id;
  const client  = adminClient();
  const now     = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

  const [todaySales, lowStock] = await Promise.all([
    client.request(readItems('sales', {
      filter: { shop: { _eq: shopId }, voided_at: { _null: true }, date_created: { _gte: todayStart } },
      fields: ['id','total','payment_method','date_created','customer.name'],
      sort:   ['-date_created'],
      limit:  10,
    })),
    client.request(readItems('products', {
      filter: {
        shop:        { _eq: shopId },
        archived_at: { _null: true },
        _or: [{ qty: { _eq: 0 } }, { qty: { _lte: locals.currentShop!.low_stock_threshold ?? 10 } }],
      },
      fields: ['id','name','qty','low_stock_threshold'],
      limit:  8,
    })),
  ]);

  const todayRevenue = (todaySales as any[]).reduce((s: number, x: any) => s + x.total, 0);
  const todayCount   = (todaySales as any[]).length;

  return { todaySales, todayRevenue, todayCount, lowStock };
}
