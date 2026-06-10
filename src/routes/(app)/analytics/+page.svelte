<script lang="ts">
  import PageShell from "$lib/components/layout/PageShell.svelte";
  import { formatCurrency } from "$lib/utils/format";
  import { goto } from "$app/navigation";
  import KpiCard from "$lib/components/ui/KpiCard.svelte";
  import AreaChart from "$lib/components/charts/AreaChart.svelte";
  import BarChart from "$lib/components/charts/BarChart.svelte";
  import HBarChart from "$lib/components/charts/HBarChart.svelte";
  import DonutChart from "$lib/components/charts/DonutChart.svelte";
  import Heatmap from "$lib/components/charts/Heatmap.svelte";
  import {
    TrendingUp,
    Users,
    ShoppingBag,
    BarChart3,
    PieChart,
    LayoutGrid,
    Calendar,
    Clock,
    Package,
    Banknote,
  } from "lucide-svelte";

  let { data } = $props();

  const presets = [
    { label: "Today", value: "today" },
    { label: "7d", value: "7d" },
    { label: "30d", value: "30d" },
    { label: "90d", value: "90d" },
    { label: "This Month", value: "this_month" },
    { label: "Last Month", value: "last_month" },
    { label: "This Year", value: "this_year" },
  ];

  const metricTabs = [
    { key: "revenue", label: "Revenue" },
    { key: "transactions", label: "Transactions" },
    { key: "avgOrder", label: "Avg Order" },
  ] as const;
  type MetricKey = (typeof metricTabs)[number]["key"];

  let activeMetric = $state<MetricKey>("revenue");

  const analytics = $derived((data as any).analytics);
  const kpis = $derived(analytics?.kpis ?? null);
  const trend = $derived(analytics?.trend ?? []);
  const period = $derived(analytics?.period ?? null);
  const grossProfit = $derived(analytics?.grossProfit ?? null);
  const stockValue = $derived(analytics?.stockValue ?? null);
  const monthlyTrend = $derived(analytics?.monthlyTrend ?? []);

  // ─── Chart data — all monetary values ÷ 100 ───────────────────────────────
  // Values are stored as integers (e.g. 150000 = 1500.00).
  // formatCurrency() handles ÷100 for text; charts need it explicitly.

  const trendLabels = $derived(trend.map((t: any) => t.label));

  const trendDatasets = $derived(
    activeMetric === 'revenue'
      ? [
          {
            label: 'Revenue',
            data: trend.map((t: any) => (t.current?.revenue ?? 0) / 100),
            borderColor: 'var(--primary)',
            backgroundColor: 'var(--primary-dim)',
            fill: true,
            tension: 0.4,
            pointRadius: 2,
            borderWidth: 2,
          },
          {
            label: 'Profit',
            // Field name may differ — check your server load fn (e.g. grossProfit, profit)
            data: trend.map((t: any) => (t.current?.profit ?? 0) / 100),
            borderColor: 'var(--cobalt)',
            fill: false,
            tension: 0.4,
            pointRadius: 2,
            borderWidth: 1.5,
          },
        ]
      : [
          {
            label: activeMetric === 'transactions' ? 'Transactions' : 'Avg Order',
            data: trend.map((t: any) =>
              activeMetric === 'transactions'
                ? (t.current?.txns ?? 0)
                : (t.current?.avgOrder ?? 0) / 100,
            ),
            borderColor: 'var(--primary)',
            backgroundColor: 'var(--primary-dim)',
            fill: true,
            tension: 0.4,
            pointRadius: 2,
            borderWidth: 2,
          },
        ]
  );

  const hourlyLabels = $derived(
    analytics?.hourly?.map((h: any) => h.label) ?? [],
  );
  const hourlyData = $derived(
    analytics?.hourly?.map((h: any) => (h.revenue ?? 0) / 100) ?? [],
  );
  const weekdayLabels = $derived(
    analytics?.weekday?.map((w: any) => w.label) ?? [],
  );
  const weekdayData = $derived(
    analytics?.weekday?.map((w: any) => (w.revenue ?? 0) / 100) ?? [],
  );
  const categoryLabels = $derived(
    analytics?.categories?.map((c: any) => c.name) ?? [],
  );
  const categoryData = $derived(
    analytics?.categories?.map((c: any) => (c.revenue ?? 0) / 100) ?? [],
  );
  const paymentRows = $derived(analytics?.paymentMethods ?? []);
  const customerTiers = $derived(analytics?.customers?.tiers);
  const leaderboard = $derived(analytics?.customers?.leaderboard ?? []);

  // Heatmap cells are also monetary integers
  const heatmapValues = $derived(
    (analytics?.heatmap ?? []).map((row: any[]) =>
      row.map((v: number) => (v ?? 0) / 100),
    ),
  );

  // Monthly chart — only months that have actual sales
  const monthlyWithData = $derived(
    monthlyTrend.filter((m: any) => (m.revenue ?? 0) > 0),
  );
  const monthlyLabels = $derived(monthlyWithData.map((m: any) => m.label));
  const monthlyRevData = $derived(
    monthlyWithData.map((m: any) => (m.revenue ?? 0) / 100),
  );

  // Current month vs previous month delta (used by §B This Month card)
  const currentMonth = $derived<any>(
    monthlyTrend[monthlyTrend.length - 1] ?? null,
  );
  const prevMonth = $derived<any>(
    monthlyTrend[monthlyTrend.length - 2] ?? null,
  );
  const monthDelta = $derived(
    currentMonth && prevMonth && prevMonth.revenue > 0
      ? ((currentMonth.revenue - prevMonth.revenue) / prevMonth.revenue) * 100
      : null,
  );
</script>

<svelte:head><title>Analytics · Shëlf</title></svelte:head>

<PageShell>
  <div class="page-header">
    <div class="flex-1">
      <p class="text-base font-semibold">Business Analytics</p>
      <p class="text-xs text-[var(--text-3)]">
        {period?.label ?? "All time"}{kpis
          ? ` · ${formatCurrency(kpis.revenue.current)} revenue`
          : ""}
      </p>
    </div>
  </div>

  <div class="p-4 md:p-6 space-y-6">
    <!-- Period Selector -->
    <div class="flex flex-wrap gap-1.5">
      {#each presets as p}
        <button
          class="btn btn-sm {period?.preset === p.value
            ? 'btn-primary'
            : 'btn-secondary'}"
          onclick={() => goto(`?period=${p.value}`, { invalidateAll: true })}
        >
          {p.label}
        </button>
      {/each}
    </div>

    {#if !analytics}
      <div class="flex items-center justify-center h-64 text-[var(--text-3)]">
        Loading analytics…
      </div>
    {:else}
      <div class="space-y-6">
        <!-- §A  KPIs — period-sensitive -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard
            label="Revenue"
            icon="TrendingUp"
            value={formatCurrency(kpis.revenue.current)}
            sub={`${Math.abs(kpis.revenue.delta?.pct ?? 0)}% vs prev`}
            trend={{
              direction: kpis.revenue.delta?.direction ?? "flat",
              label: "",
            }}
          />
          <KpiCard
            label="Sales"
            icon="ShoppingBag"
            value={String(kpis.transactions.current)}
            sub={`${Math.abs(kpis.transactions.delta?.pct ?? 0)}% vs prev`}
            trend={{
              direction: kpis.transactions.delta?.direction ?? "flat",
              label: "",
            }}
          />
          <KpiCard
            label="Avg Order"
            icon="BarChart3"
            value={formatCurrency(kpis.avgOrder.current)}
            sub={`${Math.abs(kpis.avgOrder.delta?.pct ?? 0)}% vs prev`}
            trend={{
              direction: kpis.avgOrder.delta?.direction ?? "flat",
              label: "",
            }}
          />
          {#if kpis.margin}
            <KpiCard
              label="Gross Margin"
              icon="Percent"
              value={`${kpis.margin.current.toFixed(1)}%`}
              sub={`${Math.abs(kpis.margin.delta?.pp ?? 0)} pp vs prev`}
              trend={{
                direction: kpis.margin.delta?.direction ?? "flat",
                label: "",
              }}
            />
          {/if}
        </div>

        <!-- §B  Gross Profit · Inventory Value · This Month -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
          <!-- Gross Profit -->
          {#if grossProfit}
            <div class="card p-4 space-y-3">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <Banknote size={15} style="color:var(--cobalt)" />
                  <span class="text-xs font-semibold text-[var(--text-2)]"
                    >Gross Profit</span
                  >
                </div>
                {#if grossProfit.delta}
                  <span
                    class="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                    style="background:{grossProfit.delta.direction === 'up'
                      ? 'var(--cobalt-dim)'
                      : 'var(--crimson-dim)'};
                           color:{grossProfit.delta.direction === 'up'
                      ? 'var(--cobalt-fg)'
                      : 'var(--crimson-fg)'}"
                  >
                    {grossProfit.delta.direction === "up" ? "↑" : "↓"}{Math.abs(
                      grossProfit.delta.pct,
                    )}%
                  </span>
                {/if}
              </div>
              <p class="text-xl font-bold tabular-nums">
                {formatCurrency(grossProfit.current)}
              </p>
              <p class="text-[10px] text-[var(--text-3)]">
                vs {formatCurrency(grossProfit.previous)} prev period
              </p>
            </div>
          {/if}

          <!-- Inventory Value -->
          {#if stockValue}
            <div class="card p-4 space-y-3">
              <div class="flex items-center gap-2">
                <Package size={15} style="color:var(--primary)" />
                <span class="text-xs font-semibold text-[var(--text-2)]"
                  >Inventory Value</span
                >
              </div>
              <div class="space-y-2">
                <div class="flex items-baseline justify-between">
                  <span class="text-[10px] text-[var(--text-3)]">At cost</span>
                  <span class="text-sm font-semibold tabular-nums"
                    >{formatCurrency(stockValue.costValue)}</span
                  >
                </div>
                <div class="flex items-baseline justify-between">
                  <span class="text-[10px] text-[var(--text-3)]">At retail</span
                  >
                  <span class="text-sm font-semibold tabular-nums"
                    >{formatCurrency(stockValue.retailValue)}</span
                  >
                </div>
                <div
                  class="w-full h-1.5 rounded-full bg-[var(--surface2)] overflow-hidden"
                >
                  <div
                    class="h-full rounded-full"
                    style="width:{Math.min(
                      100,
                      stockValue.potentialMargin,
                    ).toFixed(1)}%;
                           background:var(--cobalt)"
                  ></div>
                </div>
                <p class="text-[10px] text-[var(--text-3)]">
                  {stockValue.potentialMargin.toFixed(1)}% potential margin · {stockValue.totalUnits.toLocaleString()}
                  units in stock
                </p>
              </div>
            </div>
          {/if}

          <!-- Current Month -->
          {#if currentMonth}
            <div class="card p-4 space-y-3">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <Calendar size={15} style="color:var(--primary)" />
                  <span class="text-xs font-semibold text-[var(--text-2)]"
                    >This Month</span
                  >
                </div>
                {#if monthDelta !== null}
                  <span
                    class="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                    style="background:{monthDelta >= 0
                      ? 'var(--cobalt-dim)'
                      : 'var(--crimson-dim)'};
                           color:{monthDelta >= 0
                      ? 'var(--cobalt-fg)'
                      : 'var(--crimson-fg)'}"
                  >
                    {monthDelta >= 0 ? "↑" : "↓"}{Math.abs(monthDelta).toFixed(
                      1,
                    )}%
                  </span>
                {/if}
              </div>
              <p class="text-xl font-bold tabular-nums">
                {formatCurrency(currentMonth.revenue)}
              </p>
              <p class="text-[10px] text-[var(--text-3)]">
                {currentMonth.count} sale{currentMonth.count === 1 ? "" : "s"}
                · vs {formatCurrency(prevMonth?.revenue ?? 0)} last month
              </p>
            </div>
          {/if}
        </div>

        <!-- §C  Performance Trend (selected period) -->
        <div class="card p-4 space-y-4">
          <div
            class="flex flex-col md:flex-row md:items-center md:justify-between gap-3"
          >
            <div class="flex items-center gap-2">
              <TrendingUp size={16} style="color:var(--primary)" />
              <h3 class="font-semibold text-sm">
                {activeMetric === 'revenue'
                  ? 'Revenue & Profit'
                  : activeMetric === 'transactions'
                    ? 'Transaction Volume'
                    : 'Average Order Value'}
              </h3>
            </div>
            <div
              class="flex gap-1 bg-[var(--surface2)] p-1 rounded-lg text-[10px]"
            >
              {#each metricTabs as tab}
                <button
                  class="px-2 py-1 rounded transition-colors"
                  style="background:{activeMetric === tab.key
                    ? 'var(--primary)'
                    : 'transparent'};
                         color:{activeMetric === tab.key
                    ? '#fff'
                    : 'var(--text-3)'}"
                  onclick={() => (activeMetric = tab.key)}
                >
                  {tab.label}
                </button>
              {/each}
            </div>
          </div>
          <div class="h-72 w-full">
            <AreaChart labels={trendLabels} datasets={trendDatasets} />
          </div>
        </div>

        <!-- §D  Monthly Performance -->
        <div class="card p-4 space-y-4">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <BarChart3 size={16} style="color:var(--primary)" />
              <h3 class="font-semibold text-sm">Monthly Performance</h3>
            </div>
            <span class="text-[10px] text-[var(--text-3)]">
              {monthlyLabels.length} month{monthlyLabels.length === 1 ? '' : 's'} with sales
            </span>
          </div>
          <div class="h-64 w-full">
            <BarChart
              labels={monthlyLabels}
              data={monthlyRevData}
              color="var(--primary)"
              height={256}
            />
          </div>
        </div>

        <!-- §E  Distribution Row -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div class="card p-4 space-y-4">
            <div class="flex items-center gap-2">
              <PieChart size={16} style="color:var(--primary)" />
              <h3 class="font-semibold text-sm">Payment Methods</h3>
            </div>
            <div class="h-44 w-full">
              <DonutChart
                labels={paymentRows.map((pm: any) => pm.label)}
                values={paymentRows.map((pm: any) => (pm.revenue ?? 0) / 100)}
              />
            </div>
            <div class="space-y-1.5">
              {#each paymentRows as pm}
                <div class="flex items-center justify-between text-[11px]">
                  <span class="text-[var(--text-3)]">{pm.label}</span>
                  <span class="font-medium tabular-nums"
                    >{formatCurrency(pm.revenue)}</span
                  >
                </div>
              {/each}
            </div>
          </div>

          <div class="card p-4 space-y-4">
            <div class="flex items-center gap-2">
              <Clock size={16} style="color:var(--primary)" />
              <h3 class="font-semibold text-sm">Sales by Hour</h3>
            </div>
            <div class="h-44 w-full">
              <BarChart
                labels={hourlyLabels}
                data={hourlyData}
                color="var(--primary)"
                height={176}
              />
            </div>
          </div>

          <div class="card p-4 space-y-4">
            <div class="flex items-center gap-2">
              <Calendar size={16} style="color:var(--primary)" />
              <h3 class="font-semibold text-sm">Sales by Day</h3>
            </div>
            <div class="h-44 w-full">
              <HBarChart
                labels={weekdayLabels}
                data={weekdayData}
                color="var(--primary)"
                height={176}
              />
            </div>
          </div>
        </div>

        <!-- §F  Product Performance -->
        <div class="card p-4 space-y-4">
          <div class="flex items-center gap-2">
            <Package size={16} style="color:var(--primary)" />
            <h3 class="font-semibold text-sm">Product Performance</h3>
          </div>
          <div class="overflow-x-auto">
            <table class="tbl w-full text-[11px]">
              <thead>
                <tr>
                  <th class="text-left">#</th>
                  <th class="text-left">Product</th>
                  <th class="text-right">Revenue</th>
                  <th class="text-right">Units</th>
                  <th class="text-right">Margin</th>
                </tr>
              </thead>
              <tbody>
                {#each analytics.products?.byRevenue ?? [] as product, i}
                  <tr>
                    <td class="text-[var(--text-3)]">{i + 1}</td>
                    <td class="font-medium">{product.name ?? "—"}</td>
                    <td class="text-right tabular-nums"
                      >{formatCurrency(product.revenue)}</td
                    >
                    <td class="text-right tabular-nums">{product.units}</td>
                    <td class="text-right">
                      {product.margin != null
                        ? `${product.margin.toFixed(1)}%`
                        : "—"}
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>

        <!-- §G  Categories -->
        <div class="card p-4 space-y-4">
          <div class="flex items-center gap-2">
            <PieChart size={16} style="color:var(--primary)" />
            <h3 class="font-semibold text-sm">Categories</h3>
          </div>
          <div class="h-56 w-full">
            <BarChart
              labels={categoryLabels}
              data={categoryData}
              color="var(--primary)"
              height={220}
            />
          </div>
          <div class="overflow-x-auto">
            <table class="tbl w-full text-[11px]">
              <thead>
                <tr>
                  <th class="text-left">Category</th>
                  <th class="text-right">Revenue</th>
                  <th class="text-right">Units</th>
                  <th class="text-right">Avg Sale</th>
                  <th class="text-right">Margin</th>
                </tr>
              </thead>
              <tbody>
                {#each analytics.categories ?? [] as cat}
                  <tr>
                    <td class="font-medium">{cat.name}</td>
                    <td class="text-right tabular-nums"
                      >{formatCurrency(cat.revenue)}</td
                    >
                    <td class="text-right tabular-nums">{cat.units}</td>
                    <td class="text-right tabular-nums">
                      {formatCurrency(
                        Math.round(cat.revenue / (cat.units || 1)),
                      )}
                    </td>
                    <td class="text-right">
                      {cat.margin != null ? `${cat.margin.toFixed(1)}%` : "—"}
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>

        <!-- §H  Customers -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="card p-4 space-y-4">
            <div class="flex items-center gap-2">
              <Users size={16} style="color:var(--primary)" />
              <h3 class="font-semibold text-sm">Customers</h3>
            </div>
            <div class="grid grid-cols-3 gap-2 text-center text-[11px]">
              <div class="bg-[var(--surface2)] rounded-lg p-3">
                <p class="text-[var(--text-3)] mb-1">VIP</p>
                <p class="text-base font-semibold">{customerTiers?.vip ?? 0}</p>
              </div>
              <div class="bg-[var(--surface2)] rounded-lg p-3">
                <p class="text-[var(--text-3)] mb-1">Regular</p>
                <p class="text-base font-semibold">
                  {customerTiers?.regular ?? 0}
                </p>
              </div>
              <div class="bg-[var(--surface2)] rounded-lg p-3">
                <p class="text-[var(--text-3)] mb-1">New</p>
                <p class="text-base font-semibold">{customerTiers?.new ?? 0}</p>
              </div>
            </div>
            <p class="text-[10px] text-[var(--text-3)]">
              {analytics.customers?.uniqueBuyers ?? 0} unique buyers this period
            </p>
          </div>

          <div class="card p-4 space-y-4">
            <div class="flex items-center gap-2">
              <ShoppingBag size={16} style="color:var(--primary)" />
              <h3 class="font-semibold text-sm">Top Customers</h3>
            </div>
            <div class="overflow-x-auto">
              <table class="tbl w-full text-[11px]">
                <thead>
                  <tr>
                    <th class="text-left">#</th>
                    <th class="text-left">Name</th>
                    <th class="text-right">Spent</th>
                    <th class="text-right">Visits</th>
                  </tr>
                </thead>
                <tbody>
                  {#each leaderboard as customer, i}
                    <tr>
                      <td class="text-[var(--text-3)]">{i + 1}</td>
                      <td class="font-medium">{customer.name ?? "—"}</td>
                      <td class="text-right tabular-nums"
                        >{formatCurrency(customer.spent)}</td
                      >
                      <td class="text-right tabular-nums">{customer.visits}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- §I  Heatmap -->
        <div class="card p-4 space-y-4">
          <div class="flex items-center gap-2">
            <LayoutGrid size={16} style="color:var(--primary)" />
            <h3 class="font-semibold text-sm">Busiest Times</h3>
          </div>
          <Heatmap values={heatmapValues} />
          <p class="text-center text-[10px] text-[var(--text-3)] italic">
            Intensity represents average revenue per time slot
          </p>
        </div>
      </div>
    {/if}
  </div>
</PageShell>
