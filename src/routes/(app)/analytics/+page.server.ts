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

function buildGrossProfit(items: any[], compareItems: any[], productCostMap: Map<string, number>) {
  // Resolve unit cost for a sale_item using, in order:
  //   1. sale_items.cost_at_sale snapshot (written by create_sale at sale time)
  //   2. productCostMap lookup by product_id (deterministic — no FK join surprises)
  //   3. joined product.cost_price (last-ditch join fallback)
  // PostgREST returns numeric(10,2) columns as numbers in recent versions but as
  // strings in some configurations; coerce defensively. `cost_at_sale` can also
  // be the string "0" rather than the number 0, which `??` treats as truthy.
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
    const joined = toNum(it.product?.cost_price);
    return joined;
  };
  const cogs = (it: any) => unitCost(it) * toNum(it.qty);

  const sum = (arr: any[]) =>
    arr.reduce((acc, it) => acc + (toNum(it.line_total) - cogs(it)), 0);

  const profit  = sum(items);
  const cprofit = sum(compareItems);

  // Coverage: fraction of items where we found a cost > 0. Useful for UI warnings.
  const total = items.length + compareItems.length;
  const withCost = [...items, ...compareItems].filter(it => unitCost(it) > 0).length;
  const coverage = total > 0 ? Math.round((withCost / total) * 100) : 0;

  const deltaPct = cprofit > 0 ? ((profit - cprofit) / cprofit) * 100 : null;
  return {
    current:  profit,
    previous: cprofit,
    coverage,
    delta: deltaPct !== null
      ? { pct: Math.round(deltaPct), direction: deltaPct >= 0 ? 'up' : 'down' }
      : null,
  };
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

  // Query sale_items via the sales FK, filtering by sales.shop_id + sales.created_at.
  // We previously did `.in('sale_id', currentIds)` which fails with HTTP 414 (URI Too Long)
  // when a shop has hundreds of sales in the period (URL exceeds the server's URI limit).
  // The nested-filter form avoids the long `.in()` and pushes the date filter into PostgREST
  // where it can use the sale_id index. The embedded `sales(...)` select is needed so
  // PostgREST recognises the FK for the nested filter.
  const itemSelect = (extra: string) =>
    `id, sale_id, product_id, product_name, product_sku, qty, unit_price, cost_at_sale, line_total, ` +
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

  const saleItems = (allCurrentItems as any[]) ?? [];
  const compareSaleItems = (allCompareItems as any[]) ?? [];

  // productId -> cost_price, built from the products query that's already in flight.
  // Used by buildGrossProfit as the primary fallback when cost_at_sale is missing —
  // deterministic and immune to PostgREST join surprises.
  const productCostMap = new Map<string, number>(
    ((stockProducts as any[]) ?? [])
      .map((p: any) => [p.id, p.cost_price ?? 0] as const)
  );

  // Belt-and-braces: if the stockProducts query returned zero rows (e.g. all products
  // archived, or RLS stripped them on this session), the map above is empty and the
  // joined `product:products(...)` on sale_items must do all the work. That join has
  // been observed to silently return null product objects in some PostgREST versions
  // (particularly with the nested category embed), so we directly fetch the cost
  // for the exact product_ids referenced by these sale items. This bypasses both the
  // archived_at filter on the main products query AND any FK-join quirks.
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
        '[analytics] gross-profit cost map empty:',
        `stockProducts=${stockProducts?.length ?? 0} ` +
        `soldProductIds=${soldProductIds.length} ` +
        `currentItems=${saleItems.length} compareItems=${compareSaleItems.length}`
      );
    }
  }

  const kpis: KpiSet = buildKpis(
    currentSales as any[], compareSales as any[], saleItems, compareSaleItems, shopTz, productCostMap
  );
  const trend = buildTrend(
    currentSales as any[], period.from, period.to,
    compareSales as any[], period.cFrom, shopTz
  );
  const paymentMethods = buildPaymentMethods(currentSales as any[]);
  const hourly = buildHourly(currentSales as any[], shopTz);
  const weekday = buildWeekday(currentSales as any[], shopTz);
  const products = buildProducts(saleItems, productCostMap);
  const categories = buildCategories(saleItems, productCostMap);
  const customerInsights: CustomerInsights = buildCustomerInsights(
    currentSales as any[], customers as any[]
  );
  const heatmap = buildHeatmap(currentSales as any[], shopTz);
  const slowMovers = buildSlowMovers(saleItems, stockProducts as any[]);
  const monthlyTrend = buildMonthlyTrend(monthlySales as any[], shopTz);
  const stockValue = buildStockValue(stockProducts as any[]);
  const grossProfit = buildGrossProfit(saleItems, compareSaleItems, productCostMap);

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