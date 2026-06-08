import { adminClient, readItems } from '$lib/server/directus';

export async function load({ locals }) {
  const shopId     = locals.currentShop!.id;
  const client     = adminClient();
  const now        = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const threshold  = locals.currentShop!.low_stock_threshold ?? 10;

  const [todaySales, allLowStock, saleItemsToday] = await Promise.all([
    client.request(readItems('sales', {
      filter: {
        shop:         { _eq: shopId },
        voided_at:    { _null: true },
        date_created: { _gte: todayStart },
      },
      fields: ['id', 'total', 'payment_method', 'date_created', 'customer.name'],
      sort:   ['-date_created'],
      limit:  10,
    })),

    client.request(readItems('products', {
      filter: {
        shop:        { _eq: shopId },
        archived_at: { _null: true },
        _or: [{ qty: { _eq: 0 } }, { qty: { _lte: threshold } }],
      },
      fields: ['id', 'name', 'qty', 'low_stock_threshold'],
      limit:  20,
    })),

    // Fetch all sale line-items for today to compute cost & profit
    client.request(readItems('sale_items', {
      filter: {
        sale: {
          shop:         { _eq: shopId },
          voided_at:    { _null: true },
          date_created: { _gte: todayStart },
        },
      },
      fields: ['unit_price', 'qty', 'product.cost_price'],
      limit:  -1,
    })),
  ]);

  // ── Revenue & transactions ──────────────────────────────────────────────────
  const todayRevenue = (todaySales as any[]).reduce((s, x) => s + x.total, 0);
  const todayCount   = (todaySales as any[]).length;

  // ── Profit: revenue minus cost of goods sold ────────────────────────────────
  // sale_items has no unit_cost, so we use the product's current cost_price.
  const todayCost   = (saleItemsToday as any[]).reduce(
    (s, item) => s + (item.product?.cost_price ?? 0) * item.qty, 0,
  );
  const todayProfit  = todayRevenue - todayCost;
  const profitMargin = todayRevenue > 0 ? Math.round((todayProfit / todayRevenue) * 100) : 0;

  // ── Payment method breakdown ────────────────────────────────────────────────
  const paymentBreakdown = (todaySales as any[]).reduce((acc, sale) => {
    acc[sale.payment_method] = (acc[sale.payment_method] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // ── Stock: split into critical (out of stock) vs warning (low) ──────────────
  const outOfStock = (allLowStock as any[]).filter(p => p.qty === 0);
  const lowStock   = (allLowStock as any[]).filter(p => p.qty > 0);

  return {
    todaySales,
    todayRevenue,
    todayCount,
    todayProfit,
    profitMargin,
    paymentBreakdown,
    outOfStock,
    lowStock,
  };
}
