# Shëlf — Professional Analytics Page
## Design & Implementation Specification

**Version:** 1.0  
**Replaces:** Current `/analytics` page (period picker + basic bar chart)  
**Goal:** A complete business intelligence surface that answers the ten questions every shop owner actually has

---

## Table of Contents

1. [The ten questions analytics must answer](#1-the-ten-questions-analytics-must-answer)
2. [Design principles](#2-design-principles)
3. [Period selection system](#3-period-selection-system)
4. [Page layout](#4-page-layout)
5. [Section specs — every panel in detail](#5-section-specs--every-panel-in-detail)
6. [Chart library and component architecture](#6-chart-library-and-component-architecture)
7. [API design and data queries](#7-api-design-and-data-queries)
8. [Comparison logic and delta calculations](#8-comparison-logic-and-delta-calculations)
9. [Mobile adaptations](#9-mobile-adaptations)
10. [Dark mode and theming](#10-dark-mode-and-theming)
11. [Performance considerations](#11-performance-considerations)
12. [Permissions and data visibility](#12-permissions-and-data-visibility)
13. [Implementation phases](#13-implementation-phases)
14. [Future enhancements](#14-future-enhancements)

---

## 1. The ten questions analytics must answer

A shop owner opens the analytics page with one of these questions in mind. Every panel maps to at least one of them.

| # | Question | Answered by |
|---|---|---|
| 1 | How much did I make this period? | KPI strip — Revenue |
| 2 | Is my business growing or shrinking? | Revenue trend chart + KPI deltas |
| 3 | What is actually selling? | Top products panels |
| 4 | What time of day is my shop busiest? | Hourly heatmap |
| 5 | Which product categories drive the most revenue? | Category breakdown |
| 6 | Who are my best customers? | Customer leaderboard |
| 7 | Am I making a profit after cost of goods? | Margin analysis panel |
| 8 | How do customers prefer to pay? | Payment method panel |
| 9 | Are there slow-moving products I should stop stocking? | Slow movers panel |
| 10 | How does this period compare to the last one? | Period-over-period deltas on every KPI |

---

## 2. Design principles

**Numbers before charts.** Every chart is accompanied by the headline figure it represents in large type. A user should be able to read the key numbers without interpreting a visual.

**Comparison is mandatory.** Every KPI shows both the current value and its change vs. the previous equivalent period (same number of days, going back). A revenue figure without context is useless.

**One colour family.** Charts use the shop's `--primary` CSS variable (whatever palette the owner chose) rather than arbitrary rainbow palettes. Category charts use the category's own colour. This keeps the analytics page visually coherent with the rest of the app.

**Dense but not crowded.** Desktop shows 2–3 panels per row. Mobile stacks everything. No infinite scrolling — one contained page with clear section headings.

**Empty states are informative.** If there are no sales in a period, show the empty state with guidance ("Record your first sale to see analytics here") rather than blank space or a broken chart.

**Respect cost data availability.** The margin panel requires `cost_price` to be set on products. If fewer than 50 % of sold products have a cost price, show a callout explaining the data gap rather than a misleading margin figure.

---

## 3. Period selection system

### Preset periods

| Label | From | To |
|---|---|---|
| Today | Start of today (shop timezone) | Now |
| Yesterday | Start of yesterday | End of yesterday |
| Last 7 days | 7 days ago | Yesterday |
| Last 30 days | 30 days ago | Yesterday |
| Last 90 days | 90 days ago | Yesterday |
| This month | 1st of current month | Today |
| Last month | 1st of last month | Last day of last month |
| This year | 1 Jan of current year | Today |
| Custom | User-selected start | User-selected end |

**Important:** All dates are computed in the shop's timezone (stored in `shops.timezone`), using `dayjs.tz()`. A sale made at 11 PM Lagos time is in **that** day in Lagos — not UTC's next day.

### Comparison period

For each preset, the comparison period is automatically the identical-length window immediately preceding it.

```
Period:     [Jun 1 — Jun 30]  (30 days)
Comparison: [May 1 — May 31]  (30 days, same length)

Period:     [This week Mon–Sun]
Comparison: [Last week Mon–Sun]

Period:     Custom Jun 5 — Jun 19 (15 days)
Comparison: May 21 — Jun 4        (15 days back)
```

### URL persistence

Period selection is reflected in the URL so it can be bookmarked and shared:

```
/analytics?period=30d
/analytics?period=this_month
/analytics?from=2025-05-01&to=2025-05-31
```

The period picker reads from and writes to the URL using `goto()` with `{ replaceState: true }` so the browser back button returns to the previous analytics view.

---

## 4. Page layout

### Desktop (≥ 768 px)

```
┌─ Period selector strip (sticky, collapses on scroll) ────────────────────┐
│  [Today][7d][30d][90d][This month][Last month][This year][Custom ▾]      │
└──────────────────────────────────────────────────────────────────────────┘

┌─ §A: KPI strip — 4 cards ────────────────────────────────────────────────┐
│  [Revenue]  [Transactions]  [Avg Order Value]  [Gross Margin]             │
│  each card has: large number · trend badge · sparkline · vs prev period   │
└──────────────────────────────────────────────────────────────────────────┘

┌─ §B: Revenue trend (full width, 2/3 chart + 1/3 mini-KPIs) ─────────────┐
│ Area chart: current period vs previous  │  Peak day                       │
│ Toggle: Revenue / Txns / Avg Order      │  Quietest day                   │
│                                         │  Best single sale               │
└─────────────────────────────────────────┴────────────────────────────────┘

┌─ §C: Distribution row (3 equal columns) ─────────────────────────────────┐
│  Payment methods  │  Sales by hour of day  │  Sales by day of week        │
│  Donut + legend   │  Bar chart (0–23)      │  Bar chart (Mon–Sun)         │
└───────────────────┴────────────────────────┴─────────────────────────────┘

┌─ §D: Product performance (2 columns) ────────────────────────────────────┐
│  Top 10 by Revenue              │  Top 10 by Units Sold                   │
│  Horizontal bar + rank number   │  Horizontal bar + rank number           │
└─────────────────────────────────┴────────────────────────────────────────┘

┌─ §E: Category breakdown (full width) ────────────────────────────────────┐
│  Grouped bar: Revenue (primary) + Gross profit (teal) per category        │
│  Sortable table below: Category / Revenue / Units / Margin %              │
└──────────────────────────────────────────────────────────────────────────┘

┌─ §F: Customer insights (2 columns) ──────────────────────────────────────┐
│  Tier distribution              │  Top 8 customers by spend               │
│  Donut: VIP / Regular / New     │  Ranked table with visit count          │
│  New vs returning trend          │                                         │
└─────────────────────────────────┴────────────────────────────────────────┘

┌─ §G: Busiest times — heatmap (full width) ───────────────────────────────┐
│  7 rows (Mon–Sun) × 24 columns (0 h – 23 h)                              │
│  Cell colour intensity = avg revenue for that slot                        │
│  Hover tooltip: exact avg + peak day                                      │
└──────────────────────────────────────────────────────────────────────────┘

┌─ §H: Margin analysis (full width, conditional) ──────────────────────────┐
│  Stacked area: Revenue / Cost of Goods / Gross Profit per day             │
│  Shown only when ≥ 50 % of sold products have cost_price > 0             │
└──────────────────────────────────────────────────────────────────────────┘

┌─ §I: Slow movers table (full width, conditional) ────────────────────────┐
│  Products with ≤ N units sold in period, sorted by last sold date         │
│  "Consider reducing stock or running a promotion"                         │
└──────────────────────────────────────────────────────────────────────────┘
```

### Mobile (< 768 px)

The sticky period picker becomes a horizontally-scrollable chip row. All multi-column rows stack to single column. The heatmap uses abbreviated day labels (M T W T F S S) and 3-hour column buckets (0–2, 3–5, 6–8…) to fit in 375 px.

---

## 5. Section specs — every panel in detail

---

### §A — KPI Strip

**Four cards in a 2×2 grid on mobile, 1×4 row on desktop.**

#### Card: Revenue

```
┌────────────────────────────────────┐
│ 📈 TOTAL REVENUE                   │
│                                    │
│ ₦2,418,500                         │  ← large, bold
│                                    │
│ ▲ 12.4%  vs ₦2,150,300 last period │  ← green if up, red if down
│                                    │
│ ▂▃▄▃▅▆▄▅▇▆▅▇ (sparkline)          │  ← 7-day mini bar chart
└────────────────────────────────────┘
```

- **Value:** `SUM(sales.total)` for non-voided sales in period
- **Delta:** `(current - previous) / previous × 100`
- **Sparkline:** last 7 data points of the trend (even within a 30-day period), showing relative shape
- **Colour:** delta ↑ = `var(--teal)`, ↓ = `var(--crimson)`, 0 = `var(--text-3)`

#### Card: Transactions

- **Value:** `COUNT(sales.id)` for non-voided sales
- **Delta:** same comparison formula
- **Sparkline:** daily transaction counts

#### Card: Average Order Value

- **Value:** `Revenue / Transactions` — shown as currency
- **Delta:** comparison of the average, not the total
- **Insight note below:** "Highest single sale: ₦XX,XXX"

#### Card: Gross Margin %

- **Value:** `(Revenue - COGS) / Revenue × 100`
- **COGS:** `SUM(sale_items.qty × products.cost_price)` — only for products with `cost_price > 0`
- **Coverage note:** "Based on X% of sales with cost data" if coverage < 100 %
- **Delta:** shown in percentage points (pp), not %, to avoid confusion
  - e.g. "↑ 1.2 pp" (went from 33.0 % to 34.2 %)
- **If no cost data at all:** replace with "Voided Sales" KPI (count and value of voided transactions)

---

### §B — Revenue Trend Chart

**Full-width area chart.** This is the hero visual of the page.

**Chart type:** Area chart (filled, smooth curves)

**Series:**
- **Current period** — solid line, filled with `rgba(primary, 0.15)`
- **Previous period** — dashed line, filled with `rgba(text-3, 0.06)`

**X-axis granularity** (chosen automatically):
| Period length | Granularity |
|---|---|
| 1 day (Today / Yesterday) | Hourly (0–23) |
| 2–14 days | Daily |
| 15–90 days | Daily (with weekly tick marks) |
| > 90 days | Weekly |

**Toggle buttons (above the chart):**
- Revenue ← default active
- Transactions
- Avg Order Value

Switching toggles swaps both series without re-fetching data (client-side from the already-loaded payload).

**Side panel (desktop only, right of chart):**

```
Peak day         Fri 14 Jun     ₦189,400
Quietest day     Mon 10 Jun      ₦34,100
Best single sale               ₦47,800
Days with sales  22 / 30
```

**Empty day handling:** Days with zero sales are plotted as 0 (not omitted), so gaps are visible and honest.

---

### §C — Distribution Row

Three panels in a row. Each is a self-contained card.

#### Panel C1 — Payment Methods

**Chart type:** Donut chart

```
           Cash          ₦1,420,000  58.7%   ━━━━━━━━━━━━━━━
           Card/Credit     ₦680,000  28.1%   ━━━━━━━━
           Transfer        ₦318,500  13.2%   ━━━━
```

- Donut centre: total transaction count "348 sales"
- Legend below: method name + amount + percentage + colour swatch
- Colours: Cash = `var(--teal)`, Credit = `var(--cobalt)`, Transfer = `var(--gold)`
- Insight: "Cash is the dominant method. Consider promoting card payments for easier reconciliation."

#### Panel C2 — Sales by Hour of Day

**Chart type:** Vertical bar chart, 24 bars (hours 0–23)

- X-axis: 0 to 23 (or "12 AM" to "11 PM" if the shop uses 12-hour format)
- Y-axis: revenue
- Bar colour: `var(--primary)` with opacity proportional to value (darkest = busiest hour)
- Highlighted bar: peak hour with a label above it
- Below chart: "Peak hour: **2 PM – 3 PM** · Quiet period: **7 AM – 9 AM**"

#### Panel C3 — Sales by Day of Week

**Chart type:** Horizontal bar chart, 7 bars

```
Mon  ██████████████████░░░  ₦312,000
Tue  ████████████░░░░░░░░░  ₦198,000
Wed  ███████████████░░░░░░  ₦248,000
Thu  ██████████████████░░░  ₦305,000
Fri  ████████████████████░  ₦380,000  ← peak
Sat  ████████████████████░  ₦362,000
Sun  ██████░░░░░░░░░░░░░░░   ₦85,000
```

- Sort: Mon → Sun (or localised start-of-week from country setting)
- Insight callout: "Friday and Saturday account for X% of weekly revenue"

---

### §D — Product Performance

Two panels side by side.

#### Panel D1 — Top 10 by Revenue

```
#   Product                Revenue    Units   Margin%
──────────────────────────────────────────────────────
1   Hydra Serum 30ml      ₦342,000    114     41%
2   Vitamin C Cream        ₦198,000    176     38%
3   Sunscreen SPF50        ₦156,000    195     29%
…
```

**Bar visualisation:** Each row has a proportional fill bar behind the revenue figure (CSS background gradient, no SVG needed).

**Columns shown:**
- Rank (#)
- Product name
- Total revenue in period
- Units sold
- Gross margin % (if cost_price available; grey dash if not)

Clicking a row opens a side-drawer (or navigates to `/inventory/[id]`) showing the full product detail with a 30-day sales sparkline.

#### Panel D2 — Top 10 by Units Sold

Same layout, sorted by units sold descending. Both panels share the same data payload, just sorted differently on the client side.

---

### §E — Category Breakdown

**Full width. Two-part panel.**

**Part 1 — Grouped bar chart:**

```
         Skincare  Makeup  Haircare  Body care  Fragrance  Nails

Revenue  ████████  ██████   ███████   █████       ████     ███
Profit   ████      ████     █████     ████        ██       ██
```

- Revenue bar: `var(--primary)`
- Gross profit bar: `var(--teal)` (only when cost data available)
- X-axis: category names
- Sorted by revenue descending
- Category bars use each category's stored `color` value for a coloured left-border accent, not the bar fill (to keep it legible)

**Part 2 — Sortable summary table:**

| Category | Revenue | Units | Avg Sale | Margin % | vs prev |
|---|---|---|---|---|---|
| Skincare | ₦820,000 | 342 | ₦2,398 | 38.2% | ↑ 14% |
| Makeup | ₦640,000 | 580 | ₦1,103 | 31.0% | ↑ 6% |
| Haircare | ₦410,000 | 215 | ₦1,907 | 44.1% | ↓ 3% |

Click any column header to sort. Clicking a category row filters the product performance panels (D1/D2) to that category only.

---

### §F — Customer Insights

Two panels.

#### Panel F1 — Customer Tier Distribution

**Chart type:** Donut chart + stats row

```
        VIP     18 customers    ₦248,000 avg spend
        Regular 45 customers    ₦89,000 avg spend
        New     71 customers    ₦31,000 avg spend
```

Below the donut, a small 2-stat row:
- **New this period:** X customers (first-ever purchase)
- **Returning:** Y customers (purchased before this period)

**Insight:** "X% of revenue comes from VIP customers representing only Y% of the customer base. Retain them."

#### Panel F2 — Top Customers Leaderboard

```
#   Name              Spent       Visits   Tier
────────────────────────────────────────────────
1   Chiamaka Obi      ₦48,200      7       VIP
2   Ngozi Adeyemi     ₦31,500      4       VIP
3   Fatima Hassan     ₦24,800      3       Regular
…   (show top 8)
```

Each row links to `/customers/[id]`.

---

### §G — Busiest Times Heatmap

**Full width. The most visually distinctive panel.**

A 7 × 24 grid (days of week × hours of day). Each cell is coloured by average revenue for that time slot. Empty cells (no sales ever at that time) are shown in `var(--surface2)`.

```
         0  1  2  3  4  5  6  7  8  9  10 11 12 13 14 15 16 17 18 19 20 21 22 23
Mon      ░  ░  ░  ░  ░  ░  ░  ░  ▒  ▒  ▓  ▓  ▓  ██ ██ ██ ▓  ▓  ▒  ▒  ░  ░  ░  ░
Tue      ░  ░  ░  ░  ░  ░  ░  ░  ▒  ▓  ▓  ██ ██ ██ ██ ▓  ▓  ▒  ▒  ░  ░  ░  ░  ░
…
Sat      ░  ░  ░  ░  ░  ░  ░  ▒  ▓  ██ ██ ██ ██ ██ ██ ██ ██ ▓  ▓  ▒  ░  ░  ░  ░
Sun      ░  ░  ░  ░  ░  ░  ░  ░  ▒  ▒  ▒  ▓  ▓  ▓  ▒  ▒  ▒  ░  ░  ░  ░  ░  ░  ░
```

- **Cell colour:** Linear interpolation from `var(--surface2)` (zero) to `var(--primary)` (maximum)
- **Hover tooltip:** "Friday 2 PM — Avg ₦18,400 · Peak: ₦47,800 (Jun 14)"
- **Mobile:** Collapse to 4-hour buckets (0–3, 4–7, 8–11, 12–15, 16–19, 20–23) — 6 columns

**Insight callout below:** "Your busiest window is **Friday–Saturday, 12 PM–4 PM**. Make sure you're fully staffed and stocked during these hours."

---

### §H — Margin Analysis *(conditional)*

**Shown only when ≥ 50 % of sales in the period have cost price data.**

**Chart type:** Stacked area chart (revenue = top, COGS = bottom fill, profit = the visible gap)

```
₦200k ─────────────────────────────── Revenue line
      ██████████████████████████████
      ██████████████████████████████
      ██  Gross Profit (teal area)  ██
      ████████████████████████████████
₦100k ─ COGS line (muted, dashed)  ──
      ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
₦  0k
       Jun 1                     Jun 30
```

**Stats row above chart:**

| Metric | Value |
|---|---|
| Total Revenue | ₦2,418,500 |
| Cost of Goods Sold | ₦1,591,000 |
| Gross Profit | ₦827,500 |
| Gross Margin | 34.2% |

**If coverage is 50–80 %:** Show a yellow callout "Margin estimates are based on X% of sold products that have cost prices set. Set cost prices on remaining products for full accuracy."

**If coverage < 50 %:** Hide this panel, show a card: "Add cost prices to your products to unlock margin analysis" with a link to inventory.

---

### §I — Slow Movers Table *(conditional)*

**Shown when the period is ≥ 14 days AND the shop has ≥ 10 active products.**

```
Products with ≤ 2 units sold in the last 30 days

Product              Units sold   Last sold    Stock    Action
────────────────────────────────────────────────────────────────
Collagen Eye Patch        0        Never       48 left   [View]
Glycolic Toner 200ml      1        Jun 2        22 left   [View]
Rose Hip Oil 50ml         1        Jun 8        15 left   [View]
```

- Threshold for "slow mover": **≤ 5 % of average daily units sold by top performer**, minimum 2 units
- "Last sold" shows date or "Never" (if product was added but never sold)
- [View] links to `/inventory/[id]`
- Insight: "Consider a promotion, bundle offer, or reducing reorder quantities for these products."

**Not shown if all products are selling.** Replaced by a green callout: "All active products sold at least once this period. Great inventory health!"

---

## 6. Chart library and component architecture

### Library choice: Chart.js

**Why Chart.js:**
- Most mature JavaScript charting library (5M+ weekly downloads)
- All required chart types: line/area, bar (vertical + horizontal), doughnut, custom heatmap
- Proper TypeScript types via `@types/chart.js`
- Lazy-loaded via `onMount` — no SSR issues
- Respects the existing CSS variable colour system via `getComputedStyle(document.documentElement)`
- Animations work out of the box

**Install:**
```bash
npm install chart.js
```

No wrapper library needed — Chart.js works directly in Svelte via `<canvas>` refs and `onMount`.

### Pattern for every chart component

All chart components follow this structure so they're safe with SSR, reactive to period changes, and compatible with dark mode:

```svelte
<!-- src/lib/components/charts/AreaChart.svelte -->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { Chart, ChartConfiguration } from 'chart.js';

  let {
    labels,         // string[] — x-axis
    datasets,       // ChartDataset[]
    height = 240,   // px
  } = $props();

  let canvas: HTMLCanvasElement;
  let chart: Chart | null = null;

  function getCssVar(name: string) {
    return getComputedStyle(document.documentElement)
      .getPropertyValue(name).trim();
  }

  function buildConfig(): ChartConfiguration {
    const primary = getCssVar('--primary');
    const text3   = getCssVar('--text-3');
    const border  = getCssVar('--border');
    // … build Chart.js config using CSS variables
  }

  onMount(async () => {
    // Lazy-import so Chart.js doesn't end up in the SSR bundle
    const { Chart, registerables } = await import('chart.js');
    Chart.register(...registerables);
    chart = new Chart(canvas, buildConfig());
  });

  // Reactive: rebuild when data changes (period switch)
  $effect(() => {
    if (!chart) return;
    chart.data.labels   = labels;
    chart.data.datasets = datasets;
    chart.update('active');
  });

  onDestroy(() => chart?.destroy());
</script>

<div style="position:relative;height:{height}px">
  <canvas bind:this={canvas}></canvas>
</div>
```

### Reusable chart components to build

| Component | Chart.js type | Used in |
|---|---|---|
| `AreaChart.svelte` | `line` with `fill: true` | §B Revenue trend, §H Margin |
| `BarChart.svelte` | `bar` | §C hour/weekday panels, §E categories |
| `HBarChart.svelte` | `bar` with `indexAxis: 'y'` | §D products |
| `DonutChart.svelte` | `doughnut` | §C payments, §F tiers |
| `Sparkline.svelte` | `line`, no axes | §A KPI cards |
| `Heatmap.svelte` | Custom SVG (not Chart.js) | §G busiest times |

### The Heatmap is SVG, not Chart.js

Chart.js doesn't have a heatmap type. Build it as a Svelte SVG component directly — it's a grid of `<rect>` elements with computed fill colours. This is simpler and more performant than a canvas-based approach:

```svelte
<!-- Heatmap.svelte — simplified structure -->
<svg viewBox="0 0 {cols * cellW} {rows * cellH}" ...>
  {#each cells as cell}
    <rect
      x={cell.col * cellW}
      y={cell.row * cellH}
      width={cellW - gap}
      height={cellH - gap}
      rx="3"
      fill={interpolateColor(cell.value, 0, maxValue, emptyColor, primaryColor)}
    >
      <title>{cell.label}: {cell.display}</title>
    </rect>
  {/each}
</svg>
```

### Sparkline component

A tiny bar chart for KPI cards. No axes, no labels, no tooltip — just the shape of the trend:

```svelte
<!-- 7-point sparkline as SVG bars -->
<svg width="72" height="24" viewBox="0 0 72 24">
  {#each values as v, i}
    {@const h = Math.max(2, (v / maxV) * 20)}
    <rect
      x={i * 11} y={24 - h}
      width="8" height={h}
      rx="2"
      fill={trend >= 0 ? 'var(--teal)' : 'var(--crimson)'}
      opacity="0.6"
    />
  {/each}
</svg>
```

---

## 7. API design and data queries

### Single endpoint: `GET /api/analytics/full`

Rather than hitting 8 separate endpoints (one per panel), the analytics page uses **one server load function** that fires queries in parallel and returns a single payload. This means one round-trip to Directus regardless of how many panels are shown.

**Query parameters:**
```
GET /api/analytics/full?from=2025-06-01&to=2025-06-30
                        &compare_from=2025-05-01&compare_to=2025-05-31
                        &tz=Africa/Lagos
```

**Server load function** (`analytics/+page.server.ts`):

```ts
export async function load({ locals, url }) {
  const shopId       = locals.currentShop!.id;
  const tz           = locals.currentShop!.timezone;
  const { from, to, cFrom, cTo } = parsePeriod(url, tz);

  const client = adminClient();

  // All queries fire in parallel
  const [
    sales,
    compareSales,
    saleItems,
    compareSaleItems,
    products,
    customers,
  ] = await Promise.all([
    fetchSales(client, shopId, from, to),
    fetchSales(client, shopId, cFrom, cTo),
    fetchSaleItems(client, shopId, from, to),
    fetchSaleItems(client, shopId, cFrom, cTo),
    fetchProducts(client, shopId),
    fetchCustomers(client, shopId),
  ]);

  return {
    period:       { from, to },
    comparison:   { from: cFrom, to: cTo },
    kpis:         buildKpis(sales, compareSales, saleItems, compareSaleItems),
    trend:        buildTrend(sales, from, to, compareSales, cFrom, cTo, tz),
    hourly:       buildHourly(sales, tz),
    weekday:      buildWeekday(sales, tz),
    paymentMethods: buildPaymentMethods(sales, compareSales),
    topProducts:  buildTopProducts(saleItems, products),
    categories:   buildCategories(saleItems, products),
    customers:    buildCustomerInsights(sales, saleItems, customers),
    heatmap:      buildHeatmap(sales, tz),
    margin:       buildMargin(saleItems, products),
    slowMovers:   buildSlowMovers(saleItems, products),
  };
}
```

### Fetching sales

```ts
async function fetchSales(client, shopId, from, to) {
  return client.request(readItems('sales', {
    filter: {
      shop:         { _eq: shopId },
      voided_at:    { _null: true },
      date_created: { _gte: from, _lte: to },
    },
    fields: [
      'id', 'total', 'subtotal', 'tax_amount', 'payment_method',
      'date_created', 'customer',
    ],
    limit: -1,
  }));
}
```

### Fetching sale items (for product and category analysis)

```ts
async function fetchSaleItems(client, shopId, from, to) {
  return client.request(readItems('sale_items', {
    filter: {
      'sale.shop':         { _eq: shopId },
      'sale.voided_at':    { _null: true },
      'sale.date_created': { _gte: from, _lte: to },
    },
    fields: [
      'product', 'product_name', 'product_sku',
      'qty', 'unit_price', 'line_total',
      'product.cost_price', 'product.category.id',
      'product.category.name', 'product.category.color',
    ],
    limit: -1,
  }));
}
```

### Server-side aggregation functions

All aggregation runs **server-side in TypeScript**, not in SQL, because:
- Directus's REST API doesn't expose arbitrary GROUP BY
- The dataset per shop per period is small enough (hundreds to low thousands of rows)
- Server-side aggregation keeps the code readable and testable

**Key aggregation: `buildTrend()`**

```ts
function buildTrend(sales, from, to, cSales, cFrom, cTo, tz) {
  const granularity = daysBetween(from, to) <= 1 ? 'hour' : 'day';
  const slots       = generateSlots(from, to, granularity, tz);

  const current  = groupBySlot(sales,  slots, granularity, tz, 'total');
  const previous = groupBySlot(cSales, slots, granularity, tz, 'total');

  return { granularity, labels: slots.map(s => s.label), current, previous };
}
```

**Key aggregation: `buildHeatmap()`**

```ts
function buildHeatmap(sales, tz) {
  // Build a 7×24 matrix: [dayOfWeek][hour] = { total, count }
  const matrix = Array.from({ length: 7 }, () => Array(24).fill({ total: 0, count: 0 }));

  for (const sale of sales) {
    const dt  = dayjs(sale.date_created).tz(tz);
    const dow = dt.day();   // 0 = Sun, normalise to Mon = 0
    const h   = dt.hour();
    matrix[dow][h] = {
      total: matrix[dow][h].total + sale.total,
      count: matrix[dow][h].count + 1,
    };
  }

  // Convert to avg per slot
  return matrix.map(row =>
    row.map(cell => cell.count ? Math.round(cell.total / cell.count) : 0)
  );
}
```

### Slow-loading fallback

If the queries take more than 1 second, the page should show skeleton loaders for each panel. Implement this via SvelteKit `streaming` — return the fast data immediately (KPIs from the current period) and defer slower queries (slow movers, heatmap):

```ts
// In +page.server.ts
return {
  kpis:    buildKpis(sales, compareSales),   // returned immediately
  trend:   buildTrend(sales, ...),           // returned immediately
  // Deferred — shown with skeleton while loading
  heatmap: buildHeatmap(sales, tz),          // slightly more work
  slowMovers: buildSlowMovers(saleItems, products), // most expensive
};
```

---

## 8. Comparison logic and delta calculations

### Delta display rules

Every KPI shows a delta badge. The rules for colour and icon:

| Metric | "Better" = | Up colour | Down colour |
|---|---|---|---|
| Revenue | Higher | `var(--teal)` | `var(--crimson)` |
| Transactions | Higher | `var(--teal)` | `var(--crimson)` |
| Avg Order Value | Higher | `var(--teal)` | `var(--crimson)` |
| Gross Margin % | Higher | `var(--teal)` | `var(--crimson)` |
| Voided Sales | Lower | `var(--crimson)` (up = bad) | `var(--teal)` (down = good) |

### Delta function

```ts
function delta(current: number, previous: number): {
  pct: number;
  direction: 'up' | 'down' | 'flat';
  label: string;
} {
  if (previous === 0) {
    return { pct: 0, direction: 'flat', label: 'No data last period' };
  }
  const pct = Math.round((current - previous) / previous * 100);
  return {
    pct: Math.abs(pct),
    direction: pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat',
    label: pct === 0 ? 'No change' : `${Math.abs(pct)}% ${pct > 0 ? 'up' : 'down'}`,
  };
}
```

### Percentage point vs percentage

Margin % uses percentage points (pp) to avoid the confusing situation where going from 30% to 33% looks like "+10% margin":

```
❌ Gross margin ↑ 10%      (confusing — was it 30%, now 33%? or 30%, now 40%?)
✅ Gross margin ↑ 3.0 pp   (clear — went from 30.0% to 33.0%)
```

---

## 9. Mobile adaptations

| Panel | Desktop | Mobile adaptation |
|---|---|---|
| §A KPI strip | 4 cards in a row | 2×2 grid |
| §B Revenue trend | Chart 2/3 + mini-KPIs 1/3 | Full-width chart; mini-KPIs become a horizontal scroll strip below |
| §C Distribution | 3 columns | 3 stacked cards |
| §D Products | 2 columns | Tabs: "By Revenue" / "By Units" — only one shown at a time |
| §E Categories | Chart + table | Chart hidden; show table only with horizontal scroll |
| §F Customers | 2 columns | 2 stacked cards |
| §G Heatmap | 7 × 24 grid | 7 × 6 grid (4-hour buckets) |
| §H Margin | Full-width chart | Full-width chart, no scrolling |
| §I Slow movers | Table, 5 columns | Table, 3 columns (Name, Units, Stock) |

The mobile product panel uses **tabs** instead of columns so both datasets are accessible without a cramped side-by-side view:

```
[By Revenue ▼] [By Units]
──────────────────────────
1  Hydra Serum 30ml   ₦342,000
2  Vitamin C Cream    ₦198,000
…
```

---

## 10. Dark mode and theming

All chart colours use `getComputedStyle(document.documentElement).getPropertyValue('--name')` so they automatically adapt to dark mode. Rebuild the Chart.js config when the theme changes:

```ts
// In each chart component
$effect(() => {
  const dark = document.documentElement.classList.contains('dark');
  if (chart) {
    chart.options.plugins!.legend!.labels!.color =
      getComputedStyle(document.documentElement).getPropertyValue('--text-2');
    chart.options.scales!['x']!.ticks!.color =
      getComputedStyle(document.documentElement).getPropertyValue('--text-3');
    chart.update();
  }
});
```

**Dark mode colour adjustments:**

| Element | Light | Dark |
|---|---|---|
| Chart grid lines | `var(--border)` | `var(--border)` ← same, just darker |
| Tick labels | `var(--text-3)` | `var(--text-3)` ← same, adapts automatically |
| Area fill | `rgba(primary, 0.15)` | `rgba(primary, 0.25)` ← slightly more opaque |
| Tooltip bg | `var(--surface)` | `var(--surface)` |
| Tooltip border | `var(--border)` | `var(--border)` |

---

## 11. Performance considerations

### Data volume expectations

| Time period | Typical sales count | Sale items count |
|---|---|---|
| Today | 10–100 | 20–300 |
| 30 days | 300–3,000 | 600–9,000 |
| 1 year | 3,000–50,000 | 6,000–150,000 |

For periods ≤ 90 days, fetching all raw rows and aggregating server-side is fast (< 200 ms). For full-year queries, consider adding a server-side cache or switching the aggregation to Directus's `aggregate` endpoint for the summary numbers, fetching raw data only for the trend chart.

### Client-side measures

- **Chart.js is ~200 KB minified.** Lazy-import it inside `onMount` so it's excluded from the server bundle entirely.
- **Skeleton loaders** while data loads — each panel renders a grey shimmer `<Skeleton>` before the real content arrives, preventing layout shift.
- **Chart.js animation** — disable on initial load (`animation: false` for the first render) to avoid a 500 ms draw delay on page entry. Re-enable for data updates.

### Caching

The analytics page data doesn't change in real time. Apply a `Cache-Control: s-maxage=60` header on the server load so the same user refreshing within a minute gets cached data:

```ts
export async function load({ setHeaders, ... }) {
  setHeaders({ 'cache-control': 'private, max-age=60' });
  // ... queries
}
```

---

## 12. Permissions and data visibility

| Role | What they see |
|---|---|
| Owner | Everything |
| Manager | Everything except: top customers is limited to spend amounts (names hidden if `analytics.customers_detail` permission not granted) |
| Cashier | Analytics page is hidden from nav (no `analytics.view` permission) |

The `analytics.view` permission already exists in the codebase. Add a new granular permission:

```ts
// src/lib/config/permissions.ts
'analytics.customers_detail'  // see customer names in leaderboard
```

---

## 13. Implementation phases

### Phase 1 — KPI strip + Revenue trend *(~2 days)*

The highest-value panels. Answers questions 1 and 2 immediately.

- Install Chart.js
- Build `AreaChart.svelte`, `Sparkline.svelte` components
- Build `parsePeriod()` and URL persistence
- Server load: fetch sales, build KPIs and trend data
- Render §A and §B
- Period picker component with preset chips

### Phase 2 — Distribution row + Product panels *(~1.5 days)*

Answers questions 3 and 8.

- Build `DonutChart.svelte`, `BarChart.svelte`, `HBarChart.svelte`
- Add payment methods, hourly, weekday, and top-products aggregation
- Render §C and §D

### Phase 3 — Category, Customers *(~1.5 days)*

Answers questions 5 and 6.

- Category aggregation with category metadata join
- Customer tier distribution
- Top customers leaderboard
- Render §E and §F

### Phase 4 — Heatmap + Margin + Slow movers *(~2 days)*

Answers questions 4, 7, and 9.

- Build `Heatmap.svelte` (custom SVG)
- Margin aggregation with cost-price coverage check
- Slow-movers logic
- Render §G, §H, §I

### Phase 5 — Polish *(~1 day)*

- Skeleton loaders on all panels
- Dark mode reactive chart colours
- Mobile tab layout for product panels
- Mobile heatmap with 4-hour buckets
- Chart.js lazy import + animation config
- Export-to-CSV button for tables (Phase 5 or later)

---

## 14. Future enhancements

### Export and reports
A "Export" button at the top of the page generates a PDF report of the current period view — KPIs, charts as PNG snapshots, and all tables. Useful for sharing with investors or partners. Library: `jsPDF` + `html2canvas`.

### Forecasting
Show a dotted projection line on the revenue trend chart extrapolating from the current trajectory. Simple linear regression over the last 14 data points. Useful for "will I hit my monthly target?" thinking.

### Custom goals / targets
Let shop owners set a monthly revenue target. Show a horizontal dashed target line on the revenue chart, and a "₦X to go" badge on the KPI card when they're within 20% of the goal.

### Email digests
Weekly and monthly analytics summary emailed automatically to the shop owner. The backend generates the figures at midnight on the period boundary and sends via an email provider (Resend, Postmark). No front-end work needed beyond the settings toggle.

### Inventory analytics
A separate sub-tab or linked page showing stock-velocity (units sold per day), days of stock remaining at current velocity, stockout frequency, and which products are ordered just-in-time vs. over-stocked. Bridges the analytics and restocking modules.

### Multi-staff performance
When there is more than one active team member, add a "by staff member" breakdown showing transactions and revenue per `served_by` user. Useful for commission calculations and identifying training needs.

### Return on ad spend (ROAS)
If the shop owner advertises on Instagram or elsewhere, let them log an "ad spend" figure per period and show a calculated ROAS (revenue ÷ ad spend). Stored in a simple `ad_spends` collection.

---

*End of specification.*
