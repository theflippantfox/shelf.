import { adminClient, readItems } from '$lib/server/directus';

export async function load({ locals }) {
  const shopId     = locals.currentShop!.id;
  const client     = adminClient();
  const now        = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yStart     = new Date(todayStart);
  yStart.setDate(yStart.getDate() - 1);
  const yEnd       = todayStart;
  const threshold  = locals.currentShop!.low_stock_threshold ?? 10;

  const [todaySales, yestSales, allLowStock, saleItemsToday, saleItemsYest, allProducts] = await Promise.all([
    client.request(readItems('sales', {
      filter: {
        shop:         { _eq: shopId },
        voided_at:    { _null: true },
        date_created: { _gte: todayStart.toISOString() },
      },
      fields: ['id', 'total', 'payment_method', 'date_created', 'customer.id', 'customer.name'],
      sort:   ['-date_created'],
      limit:  10,
    })),

    client.request(readItems('sales', {
      filter: {
        shop:         { _eq: shopId },
        voided_at:    { _null: true },
        date_created: { _gte: yStart.toISOString(), _lt: yEnd.toISOString() },
      } as any,
      fields: ['id', 'total'],
      limit:  -1,
    })),

    client.request(readItems('products', {
      filter: {
        shop:        { _eq: shopId },
        archived_at: { _null: true },
        _or: [{ qty: { _eq: 0 } }, { qty: { _lte: threshold } }],
      },
      fields: ['id', 'name', 'qty', 'low_stock_threshold', 'unit'],
      limit:  20,
    })),

    client.request(readItems('sale_items', {
      filter: {
        sale: {
          shop:         { _eq: shopId },
          voided_at:    { _null: true },
          date_created: { _gte: todayStart.toISOString() },
        },
      },
      fields: ['unit_price', 'qty', 'line_total',
               'product.id', 'product.name', 'product.cost_price',
               'product.category.id', 'product.category.name', 'product.category.color', 'product.category.icon'],
      limit:  -1,
    })),

    client.request(readItems('sale_items', {
      filter: {
        sale: {
          shop:         { _eq: shopId },
          voided_at:    { _null: true },
          date_created: { _gte: yStart.toISOString(), _lt: yEnd.toISOString() },
        },
      } as any,
      fields: ['unit_price', 'qty', 'product.cost_price'],
      limit:  -1,
    })),

    // All products for stock-value & top-mover calculations
    client.request(readItems('products', {
      filter: { shop: { _eq: shopId }, archived_at: { _null: true } },
      fields: ['id', 'name', 'price', 'cost_price', 'qty',
               'category.id', 'category.name', 'category.color', 'category.icon'],
      limit:  -1,
    })),
  ]);

  // ── Today ────────────────────────────────────────────────────────────────
  const todayRevenue = (todaySales as any[]).reduce((s, x) => s + x.total, 0);
  const todayCount   = (todaySales as any[]).length;

  const todayCost    = (saleItemsToday as any[]).reduce(
    (s, item) => s + (item.product?.cost_price ?? 0) * item.qty, 0,
  );
  const todayProfit  = todayRevenue - todayCost;
  const profitMargin = todayRevenue > 0 ? Math.round((todayProfit / todayRevenue) * 100) : 0;

  // ── Yesterday ────────────────────────────────────────────────────────────
  const yestRevenue = (yestSales as any[]).reduce((s, x) => s + x.total, 0);
  const yestCount   = (yestSales as any[]).length;
  const yestCost    = (saleItemsYest as any[]).reduce(
    (s, item) => s + (item.product?.cost_price ?? 0) * item.qty, 0,
  );
  const yestProfit  = yestRevenue - yestCost;

  // ── Deltas (in percentage points, same sign convention as analytics) ─────
  function pctDelta(curr: number, prev: number) {
    if (prev === 0 && curr === 0) return { pct: 0, direction: 'flat' as const };
    if (prev === 0)               return { pct: 100, direction: 'up'   as const };
    const pct = Math.round(((curr - prev) / prev) * 100);
    return {
      pct: Math.abs(pct),
      direction: pct > 0 ? 'up' as const : pct < 0 ? 'down' as const : 'flat' as const,
    };
  }

  const revenueDelta = pctDelta(todayRevenue, yestRevenue);
  const txnsDelta    = pctDelta(todayCount,   yestCount);
  const profitDelta  = pctDelta(todayProfit,  yestProfit);

  // ── Payment method breakdown ──────────────────────────────────────────────
  const paymentBreakdown = (todaySales as any[]).reduce((acc, sale) => {
    acc[sale.payment_method] = (acc[sale.payment_method] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // ── Stock: split into critical (out of stock) vs warning (low) ───────────
  const outOfStock = (allLowStock as any[]).filter(p => p.qty === 0);
  const lowStock   = (allLowStock as any[]).filter(p => p.qty > 0);

  // ── Top sellers today (by qty, then by revenue) ──────────────────────────
  const productAgg = new Map<string, { id: string; name: string; qty: number; revenue: number; category: any }>();
  for (const item of saleItemsToday as any[]) {
    const pid = item.product?.id ?? item.product;          // relation can be string
    if (!pid) continue;
    const lineTotal = item.line_total ?? item.unit_price * item.qty;
    const existing  = productAgg.get(pid);
    if (existing) {
      existing.qty     += item.qty;
      existing.revenue += lineTotal;
    } else {
      productAgg.set(pid, {
        id:       pid,
        name:     item.product?.name ?? 'Unknown',
        qty:      item.qty,
        revenue:  lineTotal,
        category: item.product?.category ?? null,
      });
    }
  }
  const topProducts = [...productAgg.values()]
    .sort((a, b) => b.qty - a.qty || b.revenue - a.revenue)
    .slice(0, 5);

  // ── Top categories today (by revenue) ────────────────────────────────────
  const categoryAgg = new Map<string, { id: string; name: string; color: string; icon: string; revenue: number; qty: number }>();
  for (const item of saleItemsToday as any[]) {
    const cat = item.product?.category;
    if (!cat) continue;
    const cid = cat.id ?? cat;
    const lineTotal = item.line_total ?? item.unit_price * item.qty;
    const existing  = categoryAgg.get(cid);
    if (existing) {
      existing.revenue += lineTotal;
      existing.qty     += item.qty;
    } else {
      categoryAgg.set(cid, {
        id:       cid,
        name:     cat.name ?? 'Uncategorized',
        color:    cat.color ?? 'var(--primary)',
        icon:     cat.icon  ?? 'Package',
        revenue:  lineTotal,
        qty:      item.qty,
      });
    }
  }
  const topCategories = [...categoryAgg.values()]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 4);

  // ── Distinct customers served today ──────────────────────────────────────
  const distinctCustomers = new Set(
    (todaySales as any[])
      .map((s: any) => s.customer?.id ?? s.customer)
      .filter(Boolean),
  ).size;

  // ── Average basket size (items per sale) ──────────────────────────────────
  const totalItemsToday = (saleItemsToday as any[]).reduce((s, x) => s + x.qty, 0);
  const avgBasket       = todayCount > 0 ? +(totalItemsToday / todayCount).toFixed(1) : 0;

  // ── Stock value (at retail & at cost) ────────────────────────────────────
  let stockValueRetail = 0;
  let stockValueCost   = 0;
  for (const p of allProducts as any[]) {
    stockValueRetail += (p.price ?? 0)      * (p.qty ?? 0);
    stockValueCost   += (p.cost_price ?? 0) * (p.qty ?? 0);
  }

  // ── Greeting ─────────────────────────────────────────────────────────────
  const hour = now.getHours();
  const greeting = hour < 5  ? 'Working late'
                  : hour < 12 ? 'Good morning'
                  : hour < 17 ? 'Good afternoon'
                  : hour < 21 ? 'Good evening'
                  :             'Working late';
  const firstName = (locals.user as any)?.first_name ?? '';

  return {
    todaySales,
    todayRevenue,
    todayCount,
    todayProfit,
    profitMargin,
    revenueDelta,
    txnsDelta,
    profitDelta,
    paymentBreakdown,
    outOfStock,
    lowStock,
    topProducts,
    topCategories,
    distinctCustomers,
    avgBasket,
    stockValueRetail,
    stockValueCost,
    greeting,
    firstName,
  };
}