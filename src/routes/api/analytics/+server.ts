/**
 * /api/analytics — KPI dashboard data for the active shop.
 * Pure data-fetch + transformation; analytics utils handle all aggregation.
 */
import { json } from '@sveltejs/kit';
import { userClient } from '$lib/server/supabase';
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

function buildGrossProfit(items: any[], compareItems: any[]) {
  const calc = (arr: any[]) => {
    if (!arr || !Array.isArray(arr)) return 0;
    return arr.reduce((sum, item) => {
      const cost = (item.product?.cost_price ?? 0) * (item.qty ?? 0);
      return sum + (item.line_total ?? 0) - cost;
    }, 0);
  };
  const current = calc(items);
  const previous = calc(compareItems);
  const deltaPct = previous > 0 ? ((current - previous) / previous) * 100 : null;
  return {
    current, previous,
    delta: deltaPct !== null
      ? { pct: Math.round(deltaPct), direction: deltaPct >= 0 ? 'up' : 'down' }
      : null,
  };
}

export const GET = async ({ locals, url, setHeaders }: import('@sveltejs/kit').RequestEvent) => {
  const shop = locals.currentShop;
  if (!shop) return json({});

  const shopId = shop.id;
  const shopTz = shop.timezone ?? 'UTC';
  const currency = shop.currency_symbol ?? '$';
  const period: Period = parsePeriod(url, shopTz);

  const supabase = userClient({ locals } as any);

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

  const currentIds = (currentSales as any[]).map((s) => s.id);
  const compareIds = (compareSales as any[]).map((s) => s.id);

  const [
    { data: allCurrentItems = [] },
    { data: allCompareItems = [] },
  ] = await Promise.all([
    currentIds.length
      ? supabase.from('sale_items')
          .select('id, sale_id, product_id, product_name, product_sku, qty, unit_price, line_total, product:products(cost_price, category:categories(id, name, color))')
          .in('sale_id', currentIds)
      : { data: [] },
    compareIds.length
      ? supabase.from('sale_items')
          .select('id, sale_id, product_id, qty, line_total, product:products(cost_price)')
          .in('sale_id', compareIds)
      : { data: [] },
  ]);

  const saleItems = allCurrentItems as any[];
  const compareSaleItems = allCompareItems as any[];

  const kpis = buildKpis(currentSales as any[], compareSales as any[], saleItems, compareSaleItems, shopTz);
  const trend = buildTrend(currentSales as any[], period.from, period.to, compareSales as any[], period.cFrom, shopTz);
  const paymentMethods = buildPaymentMethods(currentSales as any[]);
  const hourly = buildHourly(currentSales as any[], shopTz);
  const weekday = buildWeekday(currentSales as any[], shopTz);
  const products = buildProducts(saleItems);
  const categories = buildCategories(saleItems);
  const customerInsights = buildCustomerInsights(currentSales as any[], customers as any[]);
  const heatmap = buildHeatmap(currentSales as any[], shopTz);
  const slowMovers = buildSlowMovers(saleItems, stockProducts as any[]);
  const monthlyTrend = buildMonthlyTrend(monthlySales as any[], shopTz);
  const stockValue = buildStockValue(stockProducts as any[]);
  const grossProfit = buildGrossProfit(saleItems, compareSaleItems);

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