import { userClient, userClientFromCtx } from "$lib/server/supabase";
import {
  buildKpis,
  buildTrend,
  buildPaymentMethods,
  buildProducts,
  buildCategories,
  buildCustomerInsights,
  buildHeatmap,
  buildCalendar,
  buildMonthCalendar,
  buildSlowMovers,
  parsePeriod,
  type Period,
  type KpiSet,
  type CustomerInsights,
} from "$lib/utils/analytics";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

dayjs.extend(utc);
dayjs.extend(timezone);

// ─── Inline helpers ──────────────────────────────────────────────────────────

function buildMonthlyTrend(sales: any[], shopTz: string) {
  const now = dayjs().tz(shopTz);
  return Array.from({ length: 12 }, (_, i) => {
    const m = now.subtract(11 - i, "month");
    const start = m.startOf("month").valueOf();
    const end = m.endOf("month").valueOf();
    const slice = sales.filter((s) => {
      const d = dayjs(s.created_at).tz(shopTz).valueOf();
      return d >= start && d <= end;
    });
    return {
      label: m.format("MMM"),
      month: m.format("YYYY-MM"),
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

function buildGrossProfit(
  items: any[],
  compareItems: any[],
  productCostMap: Map<string, number>,
) {
  // Resolve unit cost for a sale_item using, in order:
  //   1. sale_items.cost_at_sale snapshot (written by create_sale at sale time)
  //   2. productCostMap lookup by product_id (deterministic — no FK join surprises)
  //   3. joined product.cost_price (last-ditch join fallback)
  // PostgREST returns numeric(10,2) columns as numbers in recent versions but as
  // strings in some configurations; coerce defensively. `cost_at_sale` can also
  // be the string "0" rather than the number 0, which `??` treats as truthy.
  const toNum = (v: any): number => {
    if (v === null || v === undefined || v === "") return 0;
    const n = typeof v === "number" ? v : parseFloat(v);
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

  const profit = sum(items);
  const cprofit = sum(compareItems);

  // Coverage: fraction of items where we found a cost > 0. Useful for UI warnings.
  const total = items.length + compareItems.length;
  const withCost = [...items, ...compareItems].filter(
    (it) => unitCost(it) > 0,
  ).length;
  const coverage = total > 0 ? Math.round((withCost / total) * 100) : 0;

  const deltaPct = cprofit > 0 ? ((profit - cprofit) / cprofit) * 100 : null;
  return {
    current: profit,
    previous: cprofit,
    coverage,
    delta:
      deltaPct === null
        ? null
        : {
            pct: Math.round(deltaPct),
            direction: deltaPct >= 0 ? "up" : "down",
          },
  };
}

// ─── Load ────────────────────────────────────────────────────────────────────

export async function load({ locals, setHeaders }: any) {
  setHeaders?.({ "cache-control": "private, max-age=60" });

  const shop = locals.currentShop;
  if (!shop) return {};

  // Return only lightweight metadata so the page renders instantly.
  // All heavy analytics data is fetched client-side with IDB caching.
  return {
    shopMeta: {
      id: shop.id,
      shopTz: shop.timezone ?? "UTC",
      currency: shop.currency_symbol ?? "$",
    },
  };
}
