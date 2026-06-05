import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import isBetween from 'dayjs/plugin/isBetween';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isBetween);

// ── Period parsing ────────────────────────────────────────────────────────────

export interface Period {
  from:    string;   // ISO date string, shop-local midnight
  to:      string;   // ISO date string, shop-local end-of-day
  cFrom:   string;   // comparison period start
  cTo:     string;   // comparison period end
  preset:  string;
  label:   string;
}

export function parsePeriod(url: URL, shopTz: string): Period {
  const preset = url.searchParams.get('period') ?? '30d';
  const now    = dayjs().tz(shopTz);

  let from: dayjs.Dayjs, to: dayjs.Dayjs;

  switch (preset) {
    case 'today':
      from = now.startOf('day'); to = now.endOf('day'); break;
    case 'yesterday':
      from = now.subtract(1, 'day').startOf('day');
      to   = now.subtract(1, 'day').endOf('day'); break;
    case '7d':
      from = now.subtract(6, 'day').startOf('day'); to = now.endOf('day'); break;
    case '90d':
      from = now.subtract(89, 'day').startOf('day'); to = now.endOf('day'); break;
    case 'this_month':
      from = now.startOf('month'); to = now.endOf('day'); break;
    case 'last_month':
      from = now.subtract(1, 'month').startOf('month');
      to   = now.subtract(1, 'month').endOf('month'); break;
    case 'this_year':
      from = now.startOf('year'); to = now.endOf('day'); break;
    case 'custom': {
      const f = url.searchParams.get('from');
      const t = url.searchParams.get('to');
      from = f ? dayjs.tz(f, shopTz).startOf('day') : now.subtract(29, 'day').startOf('day');
      to   = t ? dayjs.tz(t, shopTz).endOf('day')   : now.endOf('day');
      break;
    }
    default: // 30d
      from = now.subtract(29, 'day').startOf('day'); to = now.endOf('day');
  }

  const span  = to.diff(from, 'day') + 1;
  const cTo   = from.subtract(1, 'day').endOf('day');
  const cFrom = cTo.subtract(span - 1, 'day').startOf('day');

  const LABELS: Record<string, string> = {
    today: 'Today', yesterday: 'Yesterday', '7d': 'Last 7 days',
    '30d': 'Last 30 days', '90d': 'Last 90 days',
    this_month: 'This month', last_month: 'Last month',
    this_year: 'This year', custom: 'Custom range',
  };

  return {
    from:   from.toISOString(),
    to:     to.toISOString(),
    cFrom:  cFrom.toISOString(),
    cTo:    cTo.toISOString(),
    preset,
    label:  LABELS[preset] ?? 'Last 30 days',
  };
}

// ── Delta ─────────────────────────────────────────────────────────────────────

export interface Delta {
  pct:       number;
  pp:        number;          // raw difference (used for margin %)
  direction: 'up' | 'down' | 'flat';
}

export function calcDelta(current: number, previous: number): Delta {
  if (previous === 0) return { pct: 0, pp: 0, direction: 'flat' };
  const pct = Math.round((current - previous) / Math.abs(previous) * 100);
  const pp  = Math.round((current - previous) * 10) / 10;
  return {
    pct: Math.abs(pct),
    pp,
    direction: pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat',
  };
}

// ── KPIs ──────────────────────────────────────────────────────────────────────

export interface KpiSet {
  revenue:      { current: number; previous: number; delta: Delta; sparkline: number[] };
  transactions: { current: number; previous: number; delta: Delta; sparkline: number[] };
  avgOrder:     { current: number; previous: number; delta: Delta };
  margin:       { current: number; previous: number; delta: Delta; coverage: number } | null;
}

export function buildKpis(
  sales: any[], compareSales: any[],
  items: any[], compareItems: any[],
  shopTz: string,
): KpiSet {
  const revenue  = sumField(sales, 'total');
  const pRevenue = sumField(compareSales, 'total');
  const txns     = sales.length;
  const pTxns    = compareSales.length;
  const avg      = txns  ? Math.round(revenue  / txns)  : 0;
  const pAvg     = pTxns ? Math.round(pRevenue / pTxns) : 0;

  const { margin, coverage }  = calcMargin(items);
  const { margin: pMargin }   = calcMargin(compareItems);

  // Last-7-slot sparkline from recent sales buckets
  const spark  = last7Buckets(sales,       shopTz);
  const pSpark = last7Buckets(compareSales, shopTz);

  return {
    revenue:      { current: revenue,  previous: pRevenue, delta: calcDelta(revenue,  pRevenue), sparkline: spark },
    transactions: { current: txns,     previous: pTxns,    delta: calcDelta(txns,     pTxns),    sparkline: pSpark },
    avgOrder:     { current: avg,       previous: pAvg,     delta: calcDelta(avg,      pAvg) },
    margin:       coverage > 0
      ? { current: margin, previous: pMargin, delta: calcDelta(margin, pMargin), coverage }
      : null,
  };
}

function sumField(arr: any[], field: string): number {
  return arr.reduce((s, r) => s + (r[field] ?? 0), 0);
}

function calcMargin(items: any[]): { margin: number; coverage: number } {
  let revenue = 0, cogs = 0, withCost = 0;
  for (const item of items) {
    const cost = item.product?.cost_price ?? 0;
    revenue += item.line_total ?? 0;
    if (cost > 0) { cogs += (item.qty ?? 0) * cost; withCost++; }
  }
  const coverage = items.length ? Math.round(withCost / items.length * 100) : 0;
  const margin   = revenue > 0 ? Math.round((revenue - cogs) / revenue * 1000) / 10 : 0;
  return { margin, coverage };
}

function last7Buckets(sales: any[], shopTz: string): number[] {
  const buckets = Array(7).fill(0);
  if (!sales.length) return buckets;
  const sorted = [...sales].sort((a, b) =>
    new Date(a.date_created).getTime() - new Date(b.date_created).getTime()
  );
  const oldest = dayjs(sorted[0].date_created).tz(shopTz);
  const newest = dayjs(sorted[sorted.length - 1].date_created).tz(shopTz);
  const span   = Math.max(newest.diff(oldest, 'day') + 1, 7);
  const step   = Math.max(Math.floor(span / 7), 1);

  for (const sale of sorted) {
    const d = dayjs(sale.date_created).tz(shopTz);
    const idx = Math.min(Math.floor(d.diff(oldest, 'day') / step), 6);
    buckets[idx] += sale.total;
  }
  return buckets;
}

// ── Revenue Trend ─────────────────────────────────────────────────────────────

export interface TrendPoint {
  label:    string;
  current:  number;
  previous: number;
  txns:     number;
  avgOrder: number;
}

export function buildTrend(
  sales: any[], from: string, to: string,
  cSales: any[], cFrom: string,
  shopTz: string,
): TrendPoint[] {
  const fromD  = dayjs(from).tz(shopTz).startOf('day');
  const toD    = dayjs(to).tz(shopTz).endOf('day');
  const days   = toD.diff(fromD, 'day') + 1;
  const hourly = days <= 1;

  if (hourly) {
    const slots: TrendPoint[] = Array.from({ length: 24 }, (_, h) => ({
      label:    h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`,
      current:  0, previous: 0, txns: 0, avgOrder: 0,
    }));
    for (const s of sales) {
      const h = dayjs(s.date_created).tz(shopTz).hour();
      slots[h].current  += s.total;
      slots[h].txns     += 1;
    }
    for (const s of cSales) {
      const h = dayjs(s.date_created).tz(shopTz).hour();
      slots[h].previous += s.total;
    }
    for (const sl of slots) {
      sl.avgOrder = sl.txns ? Math.round(sl.current / sl.txns) : 0;
    }
    return slots;
  }

  // Daily slots
  const slots: TrendPoint[] = [];
  for (let i = 0; i < days; i++) {
    const d = fromD.add(i, 'day');
    slots.push({ label: d.format('D MMM'), current: 0, previous: 0, txns: 0, avgOrder: 0 });
  }

  for (const s of sales) {
    const idx = dayjs(s.date_created).tz(shopTz).startOf('day').diff(fromD, 'day');
    if (idx >= 0 && idx < slots.length) {
      slots[idx].current += s.total;
      slots[idx].txns    += 1;
    }
  }

  const cFromD = dayjs(cFrom).tz(shopTz).startOf('day');
  for (const s of cSales) {
    const idx = dayjs(s.date_created).tz(shopTz).startOf('day').diff(cFromD, 'day');
    if (idx >= 0 && idx < slots.length) {
      slots[idx].previous += s.total;
    }
  }

  for (const sl of slots) {
    sl.avgOrder = sl.txns ? Math.round(sl.current / sl.txns) : 0;
  }

  return slots;
}

// ── Payment methods ───────────────────────────────────────────────────────────

export interface PaymentRow {
  method:  string;
  label:   string;
  revenue: number;
  count:   number;
  pct:     number;
}

export function buildPaymentMethods(sales: any[]): PaymentRow[] {
  const map: Record<string, { revenue: number; count: number }> = {};
  for (const s of sales) {
    const m = s.payment_method ?? 'cash';
    if (!map[m]) map[m] = { revenue: 0, count: 0 };
    map[m].revenue += s.total;
    map[m].count   += 1;
  }
  const total = Object.values(map).reduce((s, r) => s + r.revenue, 0);
  const LABELS: Record<string, string> = { cash: 'Cash', credit: 'Card / Credit', transfer: 'Bank Transfer' };

  return Object.entries(map)
    .map(([method, d]) => ({
      method,
      label:   LABELS[method] ?? method,
      revenue: d.revenue,
      count:   d.count,
      pct:     total > 0 ? Math.round(d.revenue / total * 100) : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);
}

// ── Hourly / weekday ─────────────────────────────────────────────────────────

export interface TimeSlot { label: string; revenue: number; count: number }

export function buildHourly(sales: any[], shopTz: string): TimeSlot[] {
  const slots: TimeSlot[] = Array.from({ length: 24 }, (_, h) => ({
    label: h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`,
    revenue: 0, count: 0,
  }));
  for (const s of sales) {
    const h = dayjs(s.date_created).tz(shopTz).hour();
    slots[h].revenue += s.total;
    slots[h].count   += 1;
  }
  return slots;
}

export function buildWeekday(sales: any[], shopTz: string): TimeSlot[] {
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const slots: TimeSlot[] = DAYS.map(label => ({ label, revenue: 0, count: 0 }));
  for (const s of sales) {
    const dow = dayjs(s.date_created).tz(shopTz).day();
    slots[dow].revenue += s.total;
    slots[dow].count   += 1;
  }
  // Reorder Mon first
  return [...slots.slice(1), slots[0]];
}

// ── Products ──────────────────────────────────────────────────────────────────

export interface ProductRow {
  name:      string;
  sku:       string;
  revenue:   number;
  units:     number;
  margin:    number | null;   // %
  maxRevenue?: number;
  maxUnits?:   number;
}

export function buildProducts(items: any[]): { byRevenue: ProductRow[]; byUnits: ProductRow[] } {
  const map: Record<string, ProductRow> = {};

  for (const item of items) {
    const key = item.product_sku || item.product_name;
    if (!map[key]) {
      map[key] = { name: item.product_name, sku: item.product_sku, revenue: 0, units: 0, margin: null };
    }
    map[key].revenue += item.line_total ?? 0;
    map[key].units   += item.qty        ?? 0;

    const cost = item.product?.cost_price;
    if (cost > 0) {
      const itemRevenue  = item.line_total ?? 0;
      const itemCogs     = (item.qty ?? 0) * cost;
      const itemMargin   = itemRevenue > 0 ? Math.round((itemRevenue - itemCogs) / itemRevenue * 100) : 0;
      map[key].margin    = itemMargin;
    }
  }

  const rows = Object.values(map);
  const byRevenue = [...rows].sort((a, b) => b.revenue - a.revenue).slice(0, 10);
  const byUnits   = [...rows].sort((a, b) => b.units   - a.units  ).slice(0, 10);

  const maxRevenue = byRevenue[0]?.revenue ?? 1;
  const maxUnits   = byUnits[0]?.units     ?? 1;
  byRevenue.forEach(r => { r.maxRevenue = maxRevenue; });
  byUnits.forEach(r   => { r.maxUnits   = maxUnits;   });

  return { byRevenue, byUnits };
}

// ── Categories ────────────────────────────────────────────────────────────────

export interface CategoryRow {
  id:      string;
  name:    string;
  color:   string;
  revenue: number;
  units:   number;
  cogs:    number;
  margin:  number | null;
}

export function buildCategories(items: any[]): CategoryRow[] {
  const map: Record<string, CategoryRow> = {};

  for (const item of items) {
    const cat   = item.product?.category;
    const catId = cat?.id ?? '__none__';
    if (!map[catId]) {
      map[catId] = {
        id:      catId,
        name:    cat?.name  ?? 'Uncategorised',
        color:   cat?.color ?? '#9b8aaa',
        revenue: 0, units: 0, cogs: 0, margin: null,
      };
    }
    map[catId].revenue += item.line_total ?? 0;
    map[catId].units   += item.qty        ?? 0;
    const cost = item.product?.cost_price ?? 0;
    if (cost > 0) map[catId].cogs += (item.qty ?? 0) * cost;
  }

  return Object.values(map)
    .map(c => ({
      ...c,
      margin: c.revenue > 0 && c.cogs > 0
        ? Math.round((c.revenue - c.cogs) / c.revenue * 100)
        : null,
    }))
    .sort((a, b) => b.revenue - a.revenue);
}

// ── Customer insights ─────────────────────────────────────────────────────────

export interface CustomerInsights {
  tiers:       { vip: number; regular: number; new: number };
  leaderboard: { id: string; name: string; spent: number; visits: number; tier: string }[];
  uniqueBuyers: number;
}

export function buildCustomerInsights(sales: any[], customers: any[]): CustomerInsights {
  const spendMap: Record<string, number> = {};
  for (const s of sales) {
    if (!s.customer) continue;
    const id = typeof s.customer === 'string' ? s.customer : s.customer?.id;
    if (!id) continue;
    spendMap[id] = (spendMap[id] ?? 0) + s.total;
  }

  const tiers = { vip: 0, regular: 0, new: 0 };
  const leaderboard: CustomerInsights['leaderboard'] = [];

  for (const c of customers) {
    const tier =
      c.visit_count >= 15 || c.total_spent >= 5000000 ? 'vip' :
      c.visit_count >= 8  || c.total_spent >= 1000000 ? 'regular' : 'new';
    tiers[tier]++;

    const periodSpent = spendMap[c.id] ?? 0;
    if (periodSpent > 0) {
      leaderboard.push({ id: c.id, name: c.name, spent: periodSpent, visits: c.visit_count, tier });
    }
  }

  leaderboard.sort((a, b) => b.spent - a.spent);

  return {
    tiers,
    leaderboard: leaderboard.slice(0, 8),
    uniqueBuyers: Object.keys(spendMap).length,
  };
}

// ── Heatmap ───────────────────────────────────────────────────────────────────

// Returns [7][24] — rows = Mon..Sun (index 0=Mon), cols = hours 0..23
export function buildHeatmap(sales: any[], shopTz: string): number[][] {
  const accum = Array.from({ length: 7 }, () =>
    Array.from({ length: 24 }, () => ({ total: 0, count: 0 }))
  );
  for (const s of sales) {
    const dt  = dayjs(s.date_created).tz(shopTz);
    const dow = (dt.day() + 6) % 7; // 0=Mon
    const h   = dt.hour();
    accum[dow][h].total += s.total;
    accum[dow][h].count += 1;
  }
  return accum.map(row =>
    row.map(cell => cell.count > 0 ? Math.round(cell.total / cell.count) : 0)
  );
}

// ── Margin analysis ───────────────────────────────────────────────────────────

export interface MarginData {
  coverage:    number;
  totalRev:    number;
  totalCogs:   number;
  grossProfit: number;
  marginPct:   number;
  daily: { label: string; revenue: number; cogs: number; profit: number }[];
}

export function buildMargin(
  items: any[], sales: any[], from: string, shopTz: string,
): MarginData | null {
  const { coverage } = calcMargin(items);
  if (coverage < 30) return null;  // not enough data

  const fromD = dayjs(from).tz(shopTz).startOf('day');
  const salesMap: Record<string, { rev: number; cogs: number }> = {};

  for (const item of items) {
    const saleId = typeof item.sale === 'string' ? item.sale : item.sale?.id;
    if (!saleId) continue;
    if (!salesMap[saleId]) salesMap[saleId] = { rev: 0, cogs: 0 };
    salesMap[saleId].rev  += item.line_total ?? 0;
    const cost = item.product?.cost_price ?? 0;
    if (cost > 0) salesMap[saleId].cogs += (item.qty ?? 0) * cost;
  }

  // Group by day
  const dayMap: Record<string, { revenue: number; cogs: number }> = {};
  for (const s of sales) {
    const key  = dayjs(s.date_created).tz(shopTz).format('YYYY-MM-DD');
    const data = salesMap[s.id];
    if (!dayMap[key]) dayMap[key] = { revenue: 0, cogs: 0 };
    dayMap[key].revenue += data?.rev  ?? s.total;
    dayMap[key].cogs    += data?.cogs ?? 0;
  }

  const daily = Object.entries(dayMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, d]) => {
      const idx   = dayjs(date).tz(shopTz).diff(fromD, 'day');
      const label = dayjs(date).tz(shopTz).format('D MMM');
      return { label, revenue: d.revenue, cogs: d.cogs, profit: d.revenue - d.cogs };
    });

  const totalRev    = daily.reduce((s, d) => s + d.revenue, 0);
  const totalCogs   = daily.reduce((s, d) => s + d.cogs,    0);
  const grossProfit = totalRev - totalCogs;
  const marginPct   = totalRev > 0 ? Math.round(grossProfit / totalRev * 1000) / 10 : 0;

  return { coverage, totalRev, totalCogs, grossProfit, marginPct, daily };
}

// ── Slow movers ───────────────────────────────────────────────────────────────

export interface SlowMover {
  id:        string;
  name:      string;
  sku:       string;
  unitsSold: number;
  stock:     number;
}

export function buildSlowMovers(items: any[], products: any[]): SlowMover[] {
  const soldMap: Record<string, number> = {};
  for (const item of items) {
    const id = typeof item.product === 'string' ? item.product : item.product?.id;
    if (id) soldMap[id] = (soldMap[id] ?? 0) + (item.qty ?? 0);
  }

  return products
    .filter(p => p.qty > 0 && (soldMap[p.id] ?? 0) === 0)
    .map(p => ({ id: p.id, name: p.name, sku: p.sku, unitsSold: 0, stock: p.qty }))
    .slice(0, 12);
}
