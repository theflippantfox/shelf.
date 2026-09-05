import { adminClient, userClient, userClientFromCtx } from '$lib/server/supabase';
import type { RequestEvent } from '@sveltejs/kit';

/**
 * Home/dashboard page — today's revenue, profit, top products, stock alerts.
 * Aggregation logic is unchanged from the original Directus version;
 * only the data-fetching layer was rewritten for Supabase.
 */
export async function load({ cookies,  locals  }: RequestEvent) {
  const shopId = locals.currentShop!.id;
  const supabase = userClientFromCtx({ cookies } as any); // RLS-correct (shop-scoped)
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yStart = new Date(todayStart);
  yStart.setDate(yStart.getDate() - 1);
  const yEnd = todayStart;

  const [
    { data: todaySales = [] },
    { data: yestSales = [] },
    { data: saleItemsToday = [] },
    { data: saleItemsYest = [] },
  ] = await Promise.all([
    supabase.from('sales')
      .select('id, total, payment_method, created_at, customer:customers(id, name)')
      .eq('shop_id', shopId)
      .is('voided_at', null)
      .gte('created_at', todayStart.toISOString())
      .order('created_at', { ascending: false })
      .limit(10),
    supabase.from('sales')
      .select('id, total')
      .eq('shop_id', shopId)
      .is('voided_at', null)
      .gte('created_at', yStart.toISOString())
      .lt('created_at', yEnd.toISOString())
      .limit(1000),
    supabase.from('sale_items')
      .select('unit_price, qty, line_total, cost_at_sale, sale:sales!inner(shop_id, voided_at, created_at), product:products(id, name, cost_price, category:categories(id, name, color, icon))')
      .eq('sale.shop_id', shopId)
      .is('sale.voided_at', null)
      .gte('sale.created_at', todayStart.toISOString())
      .limit(1000),
    supabase.from('sale_items')
      .select('unit_price, qty, cost_at_sale, sale:sales!inner(shop_id, voided_at, created_at), product:products(cost_price)')
      .eq('sale.shop_id', shopId)
      .is('sale.voided_at', null)
      .gte('sale.created_at', yStart.toISOString())
      .lt('sale.created_at', yEnd.toISOString())
      .limit(1000),
    supabase.from('products')
      .select('id, name, price, cost_price, qty, category:categories(id, name, color, icon)')
      .eq('shop_id', shopId)
      .is('archived_at', null)
      .limit(1000),
  ]);

  // ── Today ────────────────────────────────────────────────────────────────
  const todayRevenue = ((todaySales as any[]) ?? []).reduce((s, x) => s + x.total, 0);
  const todayCount   = ((todaySales as any[]) ?? []).length;

  const todayCost = ((saleItemsToday as any[]) ?? []).reduce(
    (s, item) => s + (item.cost_at_sale ?? item.product?.cost_price ?? 0) * item.qty, 0,
  );
  const todayProfit  = todayRevenue - todayCost;
  const profitMargin = todayRevenue > 0 ? Math.round((todayProfit / todayRevenue) * 100) : 0;

  // ── Yesterday ────────────────────────────────────────────────────────────
  const yestRevenue = ((yestSales as any[]) ?? []).reduce((s, x) => s + x.total, 0);
  const yestCount   = ((yestSales as any[]) ?? []).length;
  const yestCost = ((saleItemsYest as any[]) ?? []).reduce(
    (s, item) => s + (item.cost_at_sale ?? item.product?.cost_price ?? 0) * item.qty, 0,
  );
  const yestProfit  = yestRevenue - yestCost;

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

  const paymentBreakdown = ((todaySales as any[]) ?? []).reduce((acc, sale) => {
    acc[sale.payment_method] = (acc[sale.payment_method] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const productAgg = new Map<string, { id: string; name: string; qty: number; revenue: number; category: any }>();
  for (const item of (saleItemsToday as any[]) ?? []) {
    const pid = item.product?.id ?? item.product;
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

  const categoryAgg = new Map<string, { id: string; name: string; color: string; icon: string; revenue: number; qty: number }>();
  for (const item of (saleItemsToday as any[]) ?? []) {
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

  const totalItemsToday = ((saleItemsToday as any[]) ?? []).reduce((s, x) => s + x.qty, 0);
  const avgBasket       = todayCount > 0 ? +(totalItemsToday / todayCount).toFixed(1) : 0;

  // (stockValueRetail / stockValueCost are derived client-side from
  // the inventory store; they update instantly when products are
  // added or their qty changes)

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
    topProducts,
    topCategories,
    avgBasket,
    greeting,
    firstName,
  };
}