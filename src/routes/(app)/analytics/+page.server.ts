import { userClient, userClientFromCtx } from '$lib/server/supabase';
import {
  buildKpis,
  buildTrend,
  buildPaymentMethods,
  buildHourly,
  buildWeekday,
  buildProducts,
  buildCategories,
  buildCustomerInsights,
  buildHeatmap,
  buildSlowMovers,
  parsePeriod,
  type Period,
  type KpiSet,
  type CustomerInsights,
} from '$lib/utils/analytics';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);

// ─── Inline helpers ──────────────────────────────────────────────────────────

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
  let costValue = 0;
  let retailValue = 0;
  let totalUnits = 0;
  for (const p of products) {
    const qty = Math.max(0, p.qty ?? 0);
    costValue += qty * (p.cost_price ?? 0);
    retailValue += qty * (p.price ?? 0);
    totalUnits += qty;
  }
  const potentialMargin =
    retailValue > 0 ? ((retailValue - costValue) / retailValue) * 100 : 0;
  return { costValue, retailValue, totalUnits, potentialMargin };
}

function buildGrossProfit(items: any[], compareItems: any[]) {
  // sale_items.cost_at_sale is the snapshot written by create_sale at the
  // moment of sale. Fall back to the joined product.cost_price for any
  // historic rows where the snapshot is missing (e.g. pre-snapshot sales).
  // Either way, line_total - cogs = profit; 100% margin happens when both
  // are undefined and cogs collapses to 0.
  const cogs = (it: any) => {
    const unit = it.cost_at_sale ?? it.product?.cost_price ?? 0;
    return unit * (it.qty ?? 0);
  };
  const profit  = items.reduce((acc, it) => acc + ((it.line_total ?? 0) - cogs(it)), 0);
  const cprofit = compareItems.reduce((acc, it) => acc + ((it.line_total ?? 0) - cogs(it)), 0);
  return { profit, cprofit };
}

// ─── Load ────────────────────────────────────────────────────────────────────

export async function load({ cookies, locals, url, setHeaders }: any) {
  setHeaders?.({ 'cache-control': 'private, max-age=60' });

  const shop = locals.currentShop;
  if (!shop) return {};

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
      .lte('created_at', period.to),
    supabase.from('sales')
      .select('id, total, subtotal, tax_amount, payment_method, created_at, customer_id')
      .eq('shop_id', shopId)
      .is('voided_at', null)
      .gte('created_at', period.cFrom)
      .lte('created_at', period.cTo),
    supabase.from('customers')
      .select('*')
      .eq('shop_id', shopId)
      .limit(100),
    supabase.from('sales')
      .select('id, total, created_at')
      .eq('shop_id', shopId)
      .is('voided_at', null)
      .gte('created_at', monthlyFrom)
      .lte('created_at', monthlyTo),
    supabase.from('products')
      .select('id, name, price, cost_price, qty, category_id')
      .eq('shop_id', shopId)
      .is('archived_at', null),
  ]);

  const currentIds = ((currentSales as any[]) ?? []).map((s) => s.id).filter(Boolean);
  const compareIds = ((compareSales as any[]) ?? []).map((s) => s.id).filter(Boolean);

  const [
    { data: allCurrentItems = [] },
    { data: allCompareItems = [] },
  ] = await Promise.all([
    currentIds.length
      ? supabase.from('sale_items')
          .select('id, sale_id, product_id, product_name, product_sku, qty, unit_price, cost_at_sale, line_total, product:products(id, name, sku, price, cost_price, category:categories(id, name, color))')
          .in('sale_id', currentIds)
      : { data: [] },
    compareIds.length
      ? supabase.from('sale_items')
          .select('id, sale_id, product_id, qty, line_total, cost_at_sale')
          .in('sale_id', compareIds)
      : { data: [] },
  ]);

  const saleItems = (allCurrentItems as any[]) ?? [];
  const compareSaleItems = (allCompareItems as any[]) ?? [];

  const kpis: KpiSet = buildKpis(
    currentSales as any[], compareSales as any[], saleItems, compareSaleItems, shopTz
  );
  const trend = buildTrend(
    currentSales as any[], period.from, period.to,
    compareSales as any[], period.cFrom, shopTz
  );
  const paymentMethods = buildPaymentMethods(currentSales as any[]);
  const hourly = buildHourly(currentSales as any[], shopTz);
  const weekday = buildWeekday(currentSales as any[], shopTz);
  const products = buildProducts(saleItems);
  const categories = buildCategories(saleItems);
  const customerInsights: CustomerInsights = buildCustomerInsights(
    currentSales as any[], customers as any[]
  );
  const heatmap = buildHeatmap(currentSales as any[], shopTz);
  const slowMovers = buildSlowMovers(saleItems, stockProducts as any[]);
  const monthlyTrend = buildMonthlyTrend(monthlySales as any[], shopTz);
  const stockValue = buildStockValue(stockProducts as any[]);
  const grossProfit = buildGrossProfit(saleItems, compareSaleItems);

  return {
    analytics: {
      shopTz, currency, period,
      kpis, trend, paymentMethods, hourly, weekday,
      products, categories,
      customers: customerInsights,
      heatmap, slowMovers,
      monthlyTrend, stockValue, grossProfit,
    },
  };
}