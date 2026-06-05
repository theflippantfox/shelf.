import { json, type RequestHandler } from '@sveltejs/kit';
import { adminClient, readItems } from '$lib/server/directus';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import isBetween from 'dayjs/plugin/isBetween';
import {
  parsePeriod,
  calcDelta,
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
  type Period,
  type Delta,
  type KpiSet,
  type TrendPoint,
  type PaymentRow,
  type TimeSlot,
  type ProductRow,
  type CategoryRow,
  type CustomerInsights,
  type SlowMover,
} from '$lib/analytics';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isBetween);

export interface AnalyticsPayload {
  shop: { currency_symbol: string; timezone: string };
  period: Period;
  kpis: {
    revenue:      { current: number; previous: number; delta: Delta };
    transactions: { current: number; previous: number; delta: Delta };
    aov:          { current: number; previous: number; delta: Delta };
    margin:       { current: number; previous: number; delta: Delta; coverage: number } | null;
  };
  trends: { current: TrendPoint[]; previous: TrendPoint[] };
  distributions: {
    paymentMethods: PaymentRow[];
    hourly: TimeSlot[];
    weekday: TimeSlot[];
  };
  products: { byRevenue: ProductRow[]; byUnits: ProductRow[] };
  categories: CategoryRow[];
  customers: CustomerInsights;
  heatmap: number[][];
  slowMovers: SlowMover[];
}

export const GET: RequestHandler = async ({ url, locals }) => {
  const { shopId } = locals as any;
  if (!shopId) return json({ error: 'Unauthorized' }, { status: 401 });

  const client = adminClient();

  // ── Shop context ─────────────────────────────────────────────────────────
  const shop = await client.request('GET', '/items/shops', {
    params: {
      filter: { id: { _eq: shopId } },
      fields: ['*', 'currency_symbol', 'timezone'],
    },
  });
  const shopData = shop[0] as { currency_symbol?: string; timezone?: string } | undefined;
  const shopTz = shopData?.timezone || 'UTC';
  const currencySymbol = shopData?.currency_symbol || 'USD';

  // ── Period ───────────────────────────────────────────────────────────────
  const period = parsePeriod(url, shopTz);

  // ── Current-period sales ─────────────────────────────────────────────────
  const currentSales = await client.request('GET', '/items/sales', {
    params: {
      filter: {
        shop: { _eq: shopId },
        voided_at: { _null: true },
        _or: [
          { date_created: { _gte: period.from } },
          { date_created: { _lte: period.to } },
        ],
      } as any,
      fields: ['*', { sale_items: ['*', { product: ['*', { category: ['*'] }] }] }],
      sort: ['date_created'],
      limit: -1,
    },
  }) as any[];

  const currentSalesFiltered = currentSales.filter((s) => {
    const d = dayjs(s.date_created).tz(shopTz);
    return d.isSameOrAfter(period.from) && d.isSameOrBefore(period.to);
  });

  // ── Comparison-period sales ──────────────────────────────────────────────
  const compareSalesRaw = await client.request('GET', '/items/sales', {
    params: {
      filter: {
        shop: { _eq: shopId },
        voided_at: { _null: true },
        _or: [
          { date_created: { _gte: period.cFrom } },
          { date_created: { _lte: period.cTo } },
        ],
      } as any,
      fields: ['*', { sale_items: ['*', { product: ['*', { category: ['*'] }] }] }],
      sort: ['date_created'],
      limit: -1,
    },
  }) as any[];

  const compareSales = compareSalesRaw.filter((s) => {
    const d = dayjs(s.date_created).tz(shopTz);
    return d.isSameOrAfter(period.cFrom) && d.isSameOrBefore(period.cTo);
  });

  // ── Current-period items ─────────────────────────────────────────────────
  const currentSaleIds = currentSalesFiltered.map((s) => s.id);
  const currentItems = currentSaleIds.length
    ? (await client.request('GET', '/items/sale_items', {
        params: {
          filter: { sale: { _in: currentSaleIds } },
          fields: ['*', { product: ['*', { category: ['*'] }] }],
          limit: -1,
        },
      }) as any[])
    : [];

  // ── Comparison-period items ───────────────────────────────────────────────
  const compareSaleIds = compareSales.map((s) => s.id);
  const compareItems = compareSaleIds.length
    ? (await client.request('GET', '/items/sale_items', {
        params: {
          filter: { sale: { _in: compareSaleIds } },
          fields: ['*', { product: ['*', { category: ['*'] }] }],
          limit: -1,
        },
      }) as any[])
    : [];

  // ── Customer directory (from compare period for richer leaderboard) ──────
  const customerIds = Array.from(
    new Set([
      ...currentSalesFiltered.map((s) => typeof s.customer === 'string' ? s.customer : s.customer?.id).filter(Boolean),
      ...compareSales.map((s) => typeof s.customer === 'string' ? s.customer : s.customer?.id).filter(Boolean),
    ])
  );

  let customers: any[] = [];
  if (customerIds.length) {
    customers = (await client.request('GET', '/items/customers', {
      params: {
        filter: { id: { _in: customerIds } },
        fields: ['*'],
        limit: -1,
      },
    })) as any[];
  }

  // ── Build the response via the shared analytics library ──────────────────
  const kpis         = buildKpis(currentSalesFiltered, compareSales, currentItems, compareItems, shopTz);
  const trend        = buildTrend(currentSalesFiltered, period.from, period.to, compareSales, period.cFrom, shopTz);
  const paymentMethods = buildPaymentMethods(currentSalesFiltered);
  const hourly       = buildHourly(currentSalesFiltered, shopTz);
  const weekday      = buildWeekday(currentSalesFiltered, shopTz);
  const products     = buildProducts(currentItems);
  const categories   = buildCategories(currentItems);
  const customerInsights = buildCustomerInsights(currentSalesFiltered, customers);
  const heatmap      = buildHeatmap(currentSalesFiltered, shopTz);
  const slowMovers   = buildSlowMovers(currentItems, (currentSalesFiltered[0]?.sale_items ?? []) as any[]);

  const payload: AnalyticsPayload = {
    shop: {
      currency_symbol: currencySymbol,
      timezone: shopTz,
    },
    period,
    kpis: {
      revenue:      { current: kpis.revenue.current,      previous: kpis.revenue.previous,      delta: kpis.revenue.delta },
      transactions: { current: kpis.transactions.current, previous: kpis.transactions.previous, delta: kpis.transactions.delta },
      aov:          { current: kpis.avgOrder.current,     previous: kpis.avgOrder.previous,     delta: kpis.avgOrder.delta },
      margin:       kpis.margin
        ? {
            current:   kpis.margin.current,
            previous:  kpis.margin.previous,
            delta:     kpis.margin.delta,
            coverage:  kpis.margin.coverage,
          }
        : null,
    },
    trends: {
      current:  trend,
      previous: [],
    },
    distributions: {
      paymentMethods,
      hourly,
      weekday,
    },
    products: {
      byRevenue: products.byRevenue,
      byUnits:   products.byUnits,
    },
    categories,
    customers: customerInsights,
    heatmap,
    slowMovers,
  };

  return json(payload);
};
