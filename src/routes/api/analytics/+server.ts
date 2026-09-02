/**
 * /api/analytics — KPI dashboard data for the active shop.
 * Pure data-fetch + transformation; analytics utils handle all aggregation.
 */
import { json } from '@sveltejs/kit';
import { userClient, userClientFromCtx } from '$lib/server/supabase';
import {
  buildKpis, buildTrend, buildPaymentMethods, buildHourly, buildWeekday,
  buildProducts, buildCategories, buildCustomerInsights, buildHeatmap,
  buildSlowMovers, parsePeriod,
  type Period,
} from '$lib/utils/analytics';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);

function buildMonthlyTrend(sales: any[], shopTz: string) {
  const now = dayjs().tz(shopTz);
  return Array.from({ length: 12 }, (_, i) => {
    const m = now.subtract(11 - i, 'month');
    const start = m.startOf('month').valueOf();
    const end = m.endOf('month').valueOf();
    const slice = sales.filter((s) => {
      const d = dayjs(s.created_at).tz(shopTz).valueOf();
      return d >= start && d <= end;
    });
    return {
      label: m.format('MMM'),
      month: m.format('YYYY-MM'),
      revenue: slice.reduce((acc, s) => acc + (s.total ?? 0), 0),
      count: slice.length,
    };
  });
}

function buildStockValue(products: any[]) {
  let costValue = 0, retailValue = 0, totalUnits = 0;
  for (const p of products) {
    const qty = Math.max(0, p.qty ?? 0);
    costValue   += qty * (p.cost_price ?? 0);
    retailValue += qty * (p.price ?? 0);
    totalUnits  += qty;
  }
  const potentialMargin =
    retailValue > 0 ? ((retailValue - costValue) / retailValue) * 100 : 0;
  return { costValue, retailValue, totalUnits, potentialMargin };
}

function buildGrossProfit(items: any[], compareItems: any[], productCostMap: Map<string, number>) {
  const toNum = (v: any): number => {
    if (v === null || v === undefined || v === '') return 0;
    const n = typeof v === 'number' ? v : parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  };
  const unitCost = (it: any): number => {
    const snap = toNum(it.cost_at_sale);
    if (snap > 0) return snap;
    const mapped = productCostMap.get(it.product_id);
    if (mapped !== undefined && mapped > 0) return mapped;
    return toNum(it.product?.cost_price);
  };
  const cogs = (it: any) => unitCost(it) * toNum(it.qty);
  const sum = (arr: any[]) =>
    arr.reduce((s, it) => s + (toNum(it.line_total) - cogs(it)), 0);
  const current = sum(items);
  const previous = sum(compareItems);
  const total = items.length + compareItems.length;
  const withCost = [...items, ...compareItems].filter(it => unitCost(it) > 0).length;
  const coverage = total > 0 ? Math.round((withCost / total) * 100) : 0;
  const deltaPct = previous > 0 ? ((current - previous) / previous) * 100 : null;
  return {
    current, previous, coverage,
    delta: deltaPct !== null
      ? { pct: Math.round(deltaPct), direction: deltaPct >= 0 ? 'up' : 'down' }
      : null,
  };
}

export const GET = async ({ cookies, locals, url, setHeaders  }: import('@sveltejs/kit').RequestEvent) => {
  const shop = locals.currentShop;
  if (!shop) return json({});

  const shopId = shop.id;
  const shopTz = shop.timezone ?? 'UTC';
  const currency = shop.currency_symbol ?? '$';
  const period: Period = parsePeriod(url, shopTz);

  const supabase = userClientFromCtx({ cookies } as any);

  const monthlyFrom = dayjs().tz(shopTz).subtract(11, 'month').startOf('month').toISOString();
  const monthlyTo = dayjs().tz(shopTz).endOf('month').toISOString();

  const [
    { data: currentSales = [] },
    { data: compareSales = [] },
    { data: customers = [] },
    { data: monthlySales = [] },
    { data: stockProducts = [] },
  ] = await Promise.all([
    supabase.from('sales')
      .select('id, total, subtotal, tax_amount, payment_method, created_at, customer_id')
      .eq('shop_id', shopId)
      .is('voided_at', null)
      .gte('created_at', period.from)
      .lte('created_at', period.to)
      .order('created_at'),
    supabase.from('sales')
      .select('id, total, subtotal, tax_amount, payment_method, created_at, customer_id')
      .eq('shop_id', shopId)
      .is('voided_at', null)
      .gte('created_at', period.cFrom)
      .lte('created_at', period.cTo)
      .order('created_at'),
    supabase.from('customers').select('*').eq('shop_id', shopId).limit(100),
    supabase.from('sales')
      .select('id, total, created_at')
      .eq('shop_id', shopId)
      .is('voided_at', null)
      .gte('created_at', monthlyFrom)
      .lte('created_at', monthlyTo)
      .order('created_at'),
    supabase.from('products')
      .select('id, price, cost_price, qty')
      .eq('shop_id', shopId)
      .is('archived_at', null),
  ]);

  const currentIds = (currentSales as any[]).map((s: any) => s.id);
  const compareIds = (compareSales as any[]).map((s: any) => s.id);

  // Query sale_items via the sales FK to avoid `.in('sale_id', ...)` hitting URI length
  // limits when a shop has hundreds of sales in the period. See analytics/+page.server.ts.
  const itemSelect = (extra: string) =>
    `id, sale_id, product_id, product_name, product_sku, qty, unit_price, line_total, cost_at_sale, ` +
    `product:products(id, name, sku, price, cost_price, category:categories(id, name, color)), ` +
    `sales!inner(shop_id, created_at)${extra}`;

  const [
    { data: allCurrentItems = [] },
    { data: allCompareItems = [] },
  ] = await Promise.all([
    supabase.from('sale_items')
      .select(itemSelect(''))
      .eq('sales.shop_id', shopId)
      .gte('sales.created_at', period.from)
      .lte('sales.created_at', period.to),
    supabase.from('sale_items')
      .select(itemSelect(''))
      .eq('sales.shop_id', shopId)
      .gte('sales.created_at', period.cFrom)
      .lte('sales.created_at', period.cTo),
  ]);

  const saleItems = allCurrentItems as any[];
  const compareSaleItems = allCompareItems as any[];

  const productCostMap = new Map<string, number>(
    ((stockProducts as any[]) ?? []).map((p: any) => [p.id, p.cost_price ?? 0] as const)
  );

  // Direct-fetch fallback when stockProducts was empty (archived products / RLS strip).
  // See analytics/+page.server.ts for full explanation.
  const soldProductIds = Array.from(new Set([
    ...((saleItems ?? []).map((it: any) => it.product_id)),
    ...((compareSaleItems ?? []).map((it: any) => it.product_id)),
  ].filter(Boolean) as string[]));

  if (soldProductIds.length && productCostMap.size === 0) {
    const { data: directProducts = [] } = await supabase
      .from('products')
      .select('id, cost_price')
      .in('id', soldProductIds);
    for (const p of (directProducts as any[])) {
      const cost = Number(p.cost_price ?? 0);
      if (cost > 0) productCostMap.set(p.id, cost);
    }
    if (productCostMap.size === 0) {
      console.warn(
        '[api/analytics] gross-profit cost map empty:',
        `stockProducts=${stockProducts?.length ?? 0} ` +
        `soldProductIds=${soldProductIds.length} ` +
        `currentItems=${saleItems.length} compareItems=${compareSaleItems.length}`
      );
    }
  }

  const kpis = buildKpis(currentSales as any[], compareSales as any[], saleItems, compareSaleItems, shopTz, productCostMap);
  const trend = buildTrend(currentSales as any[], period.from, period.to, compareSales as any[], period.cFrom, shopTz);
  const paymentMethods = buildPaymentMethods(currentSales as any[]);
  const hourly = buildHourly(currentSales as any[], shopTz);
  const weekday = buildWeekday(currentSales as any[], shopTz);
  const products = buildProducts(saleItems, productCostMap);
  const categories = buildCategories(saleItems, productCostMap);
  const customerInsights = buildCustomerInsights(currentSales as any[], customers as any[]);
  const heatmap = buildHeatmap(currentSales as any[], shopTz);
  const slowMovers = buildSlowMovers(saleItems, stockProducts as any[]);
  const monthlyTrend = buildMonthlyTrend(monthlySales as any[], shopTz);
  const stockValue = buildStockValue(stockProducts as any[]);
  const grossProfit = buildGrossProfit(saleItems, compareSaleItems, productCostMap);

  setHeaders({ 'cache-control': 'private, max-age=60' });

  return json({
    analytics: {
      shopTz, currency, period,
      kpis, trend, paymentMethods, hourly, weekday,
      products, categories,
      customers: customerInsights,
      heatmap, slowMovers, monthlyTrend,
      stockValue, grossProfit,
    },
  });
};