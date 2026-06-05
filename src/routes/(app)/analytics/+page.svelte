<script lang="ts">
  import PageShell from '$lib/components/layout/PageShell.svelte';
  import { formatCurrency } from '$lib/utils/format';
  import { goto } from '$app/navigation';
  import { browser } from '$app/environment';
  import KpiCard from '$lib/components/ui/KpiCard.svelte';
  import AreaChart from '$lib/components/charts/AreaChart.svelte';
  import BarChart from '$lib/components/charts/BarChart.svelte';
  import HBarChart from '$lib/components/charts/HBarChart.svelte';
  import DonutChart from '$lib/components/charts/DonutChart.svelte';
  import Sparkline from '$lib/components/charts/Sparkline.svelte';
  import Heatmap from '$lib/components/charts/Heatmap.svelte';

  import {
    TrendingUp,
    Users,
    ShoppingBag,
    DollarSign,
    Percent,
    BarChart3,
    PieChart,
    LayoutGrid,
    Calendar,
    Clock
  } from 'lucide-svelte';

  let { data } = $props();

  const presets = [
    { label: 'Today', value: 'today' },
    { label: '7d', value: '7d' },
    { label: '30d', value: '30d' },
    { label: '90d', value: '90d' },
    { label: 'This Month', value: 'this_month' },
    { label: 'Last Month', value: 'last_month' },
    { label: 'This Year', value: 'this_year' }
  ];

  const metricTabs = [
    { key: 'revenue', label: 'Revenue' },
    { key: 'transactions', label: 'Transactions' },
    { key: 'avgOrder', label: 'Avg Order' }
  ] as const;
  type MetricKey = (typeof metricTabs)[number]['key'];

  let activeMetric = $state<MetricKey>('revenue');

  const analytics = $derived((data as any).analytics);
  const kpis = $derived(analytics?.kpis ?? null);
  const trend = $derived(analytics?.trend ?? []);
  const currency = $derived(analytics?.currency ?? '$');
  const period = analytics?.period ?? null;

  const labels = $derived(trend.map((t) => t.label));
  const renderedDatasets = $derived([
    {
      label: 'Current',
      data: trend.map((t) => {
        if (activeMetric === 'revenue') return t.current.revenue;
        if (activeMetric === 'transactions') return t.current.txns;
        return t.current.avgOrder;
      }),
      borderColor: 'var(--primary)',
      backgroundColor: 'rgba(123, 79, 138, 0.15)',
      fill: true,
      tension: 0.4,
      pointRadius: 2,
      borderWidth: 2
    },
    {
      label: 'Previous',
      data: trend.map((t) => t.previous),
      borderColor: 'var(--text-3)',
      backgroundColor: 'rgba(255,255,255,0.04)',
      fill: true,
      tension: 0.4,
      pointRadius: 0,
      borderWidth: 1,
      borderDash: [5, 5]
    }
  ]);

  const hourlyLabels = $derived(analytics?.hourly?.map((h) => h.label) ?? []);
  const hourlyData = $derived(analytics?.hourly?.map((h) => h.revenue) ?? []);
  const weekdayLabels = $derived(analytics?.weekday?.map((w) => w.label) ?? []);
  const weekdayData = $derived(analytics?.weekday?.map((w) => w.revenue) ?? []);
  const categoryLabels = $derived(analytics?.categories?.map((c) => c.name) ?? []);
  const categoryData = $derived(analytics?.categories?.map((c) => c.revenue) ?? []);
  const paymentRows = $derived(analytics?.paymentMethods ?? []);
  const customerTiers = $derived(analytics?.customers?.tiers);
  const leaderboard = $derived(analytics?.customers?.leaderboard ?? []);
  const heatmapValues = $derived(analytics?.heatmap ?? []);
</script>

<PageShell>
  <div class="page-header">
    <div class="flex-1">
      <p class="text-base font-semibold">Business Analytics</p>
      <p class="text-xs text-[var(--text-3)]">
        {#if period}
          {period.label}
          {kpis ? ` · ${formatCurrency(kpis.revenue.current, currency)} revenue` : ''}
        {:else}All time{/if}
      </p>
    </div>
  </div>

  <div class="p-4 md:p-6 space-y-6">
    <!-- Period Selector -->
    <div
      class="sticky top-20 z-10 bg-surface-1/80 backdrop-blur-md p-2 rounded-xl border border-surface-2 flex flex-wrap gap-2 justify-center md:justify-start"
    >
      {#each presets as p}
        <button
          class="px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
          class:bg-primary={period?.preset === p.value}
          class:text-white={period?.preset === p.value}
          class:shadow-sm={period?.preset === p.value}
          class:bg-surface-2={period?.preset !== p.value}
          class:text-[var(--text-3)]={period?.preset !== p.value}
          onclick={() => goto(`?period=${p.value}`, { invalidateAll: true })}
        >
          {p.label}
        </button>
      {/each}
    </div>

    {#if kpis === null}
      <div class="flex items-center justify-center h-64 text-[var(--text-3)]">
        Loading analytics...
      </div>
    {:else if !analytics}
      <div class="flex items-center justify-center h-64 text-[var(--text-3)]">
        Select a timeframe to load analytics.
      </div>
    {:else}
      <div class="space-y-6">
        <!-- §A KPI Strip -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard
            label="Revenue"
            icon="DollarSign"
            value={formatCurrency(kpis.revenue.current, currency)}
            sub={`${Math.abs(kpis.revenue.delta?.pct ?? 0)}% vs prev`}
            trend={{ direction: kpis.revenue.delta?.direction ?? 'flat', label: '' }}
          />
          <KpiCard
            label="Sales"
            icon="ShoppingBag"
            value={String(kpis.transactions.current)}
            sub={`${Math.abs(kpis.transactions.delta?.pct ?? 0)}% vs prev`}
            trend={{ direction: kpis.transactions.delta?.direction ?? 'flat', label: '' }}
          />
          <KpiCard
            label="Avg Order"
            icon="BarChart3"
            value={formatCurrency(kpis.avgOrder.current, currency)}
            sub={`${Math.abs(kpis.avgOrder.delta?.pct ?? 0)}% vs prev`}
            trend={{ direction: kpis.avgOrder.delta?.direction ?? 'flat', label: '' }}
          />
          {#if kpis.margin}
            <KpiCard
              label="Gross Margin"
              icon="Percent"
              value={`${kpis.margin.current.toFixed(1)}%`}
              sub={`${Math.abs(kpis.margin.delta?.pp ?? 0)} pp vs prev`}
              trend={{ direction: kpis.margin.delta?.direction ?? 'flat', label: '' }}
            />
          {/if}
        </div>

        <!-- §B Revenue Trend -->
        <div class="card p-4 space-y-4">
          <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div class="flex items-center gap-2">
              <TrendingUp size={16} class="text-primary" />
              <h3 class="font-semibold text-sm">Revenue Trend</h3>
            </div>
            <div class="flex gap-1 bg-surface-2 p-1 rounded-lg text-[10px]">
              {#each metricTabs as tab}
                <button
                  class="px-2 py-1 rounded"
                  class:bg-primary={activeMetric === tab.key}
                  class:text-white={activeMetric === tab.key}
                  class:text-[var(--text-3)]={activeMetric !== tab.key}
                  onclick={() => activeMetric = tab.key}
                >
                  {tab.label}
                </button>
              {/each}
            </div>
          </div>
          <div class="h-72 w-full">
            <AreaChart labels={labels} datasets={renderedDatasets} />
          </div>
        </div>

        <!-- §C Distribution Row -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
          <!-- Payment Methods -->
          <div class="card p-4 space-y-4">
            <div class="flex items-center gap-2">
              <PieChart size={16} class="text-primary" />
              <h3 class="font-semibold text-sm">Payment Methods</h3>
            </div>
            <div class="h-44 w-full relative">
              <DonutChart
                labels={paymentRows.map((paymentMethod) => paymentMethod.label)}
                values={paymentRows.map((paymentMethod) => paymentMethod.revenue)}
              />
            </div>
            <div class="space-y-1">
              {#each paymentRows as paymentMethod}
                <div class="flex items-center justify-between text-[11px]">
                  <span class="text-[var(--text-3)]">{paymentMethod.label}</span>
                  <span class="font-medium">{formatCurrency(paymentMethod.revenue, currency)}</span>
                </div>
              {/each}
            </div>
          </div>

          <!-- Hourly -->
          <div class="card p-4 space-y-4">
            <div class="flex items-center gap-2">
              <Clock size={16} class="text-primary" />
              <h3 class="font-semibold text-sm">Sales by Hour</h3>
            </div>
            <div class="h-44 w-full">
              <BarChart labels={hourlyLabels} data={hourlyData} color="var(--primary)" height={176} />
            </div>
          </div>

          <!-- Weekday -->
          <div class="card p-4 space-y-4">
            <div class="flex items-center gap-2">
              <Calendar size={16} class="text-primary" />
              <h3 class="font-semibold text-sm">Sales by Day</h3>
            </div>
            <div class="h-44 w-full">
              <HBarChart labels={weekdayLabels} data={weekdayData} color="var(--primary)" height={176} />
            </div>
          </div>
        </div>

        <!-- §D Product Performance -->
        <div class="card p-4 space-y-4">
          <div class="flex items-center gap-2">
            <LayoutGrid size={16} class="text-primary" />
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
                {#each analytics.products.byRevenue ?? [] as product, i}
                  <tr>
                    <td class="text-[var(--text-3)]">{i + 1}</td>
                    <td class="font-medium">{product.name ?? '—'}</td>
                    <td class="text-right">{formatCurrency(product.revenue, currency)}</td>
                    <td class="text-right">{product.units}</td>
                    <td class="text-right">{product.margin != null ? `${product.margin.toFixed(1)}%` : '—'}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>

        <!-- §E Categories -->
        <div class="card p-4 space-y-4">
          <div class="flex items-center gap-2">
            <PieChart size={16} class="text-primary" />
            <h3 class="font-semibold text-sm">Categories</h3>
          </div>
          <div class="h-56 w-full">
            <BarChart labels={categoryLabels} data={categoryData} color="var(--primary)" height={220} />
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
                {#each analytics.categories ?? [] as category}
                  <tr>
                    <td class="font-medium">{category.name}</td>
                    <td class="text-right">{formatCurrency(category.revenue, currency)}</td>
                    <td class="text-right">{category.units}</td>
                    <td class="text-right">{formatCurrency(category.revenue / (category.units || 1), currency)}</td>
                    <td class="text-right">{category.margin != null ? `${category.margin.toFixed(1)}%` : '—'}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>

        <!-- §F Customers -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div class="card p-4 space-y-4">
            <div class="flex items-center gap-2">
              <Users size={16} class="text-primary" />
              <h3 class="font-semibold text-sm">Customers</h3>
            </div>
            <div class="grid grid-cols-3 gap-2 text-center text-[11px]">
              <div class="bg-surface-2 rounded-lg p-2">
                <p class="text-[var(--text-3)]">VIP</p>
                <p class="text-base font-semibold">{customerTiers?.vip ?? 0}</p>
              </div>
              <div class="bg-surface-2 rounded-lg p-2">
                <p class="text-[var(--text-3)]">Regular</p>
                <p class="text-base font-semibold">{customerTiers?.regular ?? 0}</p>
              </div>
              <div class="bg-surface-2 rounded-lg p-2">
                <p class="text-[var(--text-3)]">New</p>
                <p class="text-base font-semibold">{customerTiers?.new ?? 0}</p>
              </div>
            </div>
            <p class="text-[10px] text-[var(--text-3)]">
              {analytics.customers?.uniqueBuyers ?? 0} unique buyers this period
            </p>
          </div>

          <div class="card p-4 space-y-4">
            <div class="flex items-center gap-2">
              <ShoppingBag size={16} class="text-primary" />
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
                      <td class="font-medium">{customer.name ?? '—'}</td>
                      <td class="text-right">{formatCurrency(customer.spent, currency)}</td>
                      <td class="text-right">{customer.visits}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- §G Heatmap -->
        <div class="card p-4 space-y-4">
          <div class="flex items-center gap-2">
            <LayoutGrid size={16} class="text-primary" />
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
