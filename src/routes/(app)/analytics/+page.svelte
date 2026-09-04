<script lang="ts">
  import { formatCurrency, formatCurrencyCompact } from "$lib/utils/format";
  import { goto } from "$app/navigation";
  import KpiCard from "$lib/components/ui/KpiCard.svelte";
  import AreaChart from "$lib/components/charts/AreaChart.svelte";
  import BarChart from "$lib/components/charts/BarChart.svelte";
  import DonutChart from "$lib/components/charts/DonutChart.svelte";
  import Heatmap from "$lib/components/charts/Heatmap.svelte";
  import DynamicIcon from "$lib/components/ui/DynamicIcon.svelte";
  import {
    TrendingUp, Users, ShoppingBag, BarChart3, PieChart, ShoppingCart,
    Calendar, Clock, Package, Banknote, ArrowUp, ArrowDown,
    Minus, Trophy, Activity,
  } from "lucide-svelte";

  let { data } = $props();

  const presets = [
    { label: "Today",       value: "today" },
    { label: "Yesterday",   value: "yesterday" },
    { label: "7 days",      value: "7d" },
    { label: "30 days",     value: "30d" },
    { label: "90 days",     value: "90d" },
    { label: "This Month",  value: "this_month" },
    { label: "Last Month",  value: "last_month" },
    { label: "This Year",   value: "this_year" },
  ];

  const metricTabs = [
    { key: "revenue",      label: "Revenue",      icon: "TrendingUp" },
    { key: "transactions", label: "Transactions", icon: "ShoppingBag" },
    { key: "avgOrder",     label: "Avg Order",    icon: "BarChart3" },
  ] as const;
  type MetricKey = (typeof metricTabs)[number]["key"];

  let activeMetric = $state<MetricKey>("revenue");

  const analytics = $derived((data as any).analytics);
  const kpis      = $derived(analytics?.kpis ?? null);
  const trend     = $derived(analytics?.trend ?? []);
  const period    = $derived(analytics?.period ?? null);
  const grossProfit = $derived(analytics?.grossProfit ?? null);
  const stockValue = $derived(analytics?.stockValue ?? null);
  const monthlyTrend = $derived(analytics?.monthlyTrend ?? []);

  /* ── chart data ────────────────────────────────────────────────────────── */
  const trendLabels = $derived(trend.map((t: any) => t.label));

  // Trend values are in major units (rupees), straight from sales.total.
  // The AreaChart with yFormat="currency" formats them as-is — no division.
  const trendDatasets = $derived(
    activeMetric === 'revenue'
      ? [{
          label: 'Revenue',
          data: trend.map((t: any) => t.current ?? 0),
        }]
      : [{
          label: activeMetric === 'transactions' ? 'Transactions' : 'Avg Order',
          data: trend.map((t: any) =>
            activeMetric === 'transactions' ? (t.txns ?? 0) : (t.avgOrder ?? 0)),
        }]
  );

  // Calendar (year-long daily revenue heatmap) — shown independent of
  // the period filter, so it always reflects the long-term shape of
  // the business.
  const calendar = $derived(analytics?.calendar ?? null);
  const paymentRows = $derived(analytics?.paymentMethods ?? []);
  const customerTiers = $derived(analytics?.customers?.tiers);
  const leaderboard = $derived(analytics?.customers?.leaderboard ?? []);

  // Heatmap values are in major units (rupees). The Heatmap chart uses
  // formatCurrency() for tooltips by default.
  const heatmapValues = $derived(
    (analytics?.heatmap ?? []).map((row: any[]) =>
      row.map((v: number) => v ?? 0),
    ),
  );

  /* ── monthly chart: last 12 months (rolling) ───────────────────────────── */
  const monthlyWithData = $derived(monthlyTrend.filter((m: any) => (m.revenue ?? 0) > 0));
  const monthlyLabels   = $derived(monthlyWithData.map((m: any) => m.label));
  const monthlyRevData  = $derived(monthlyWithData.map((m: any) => m.revenue ?? 0));

  /* ── derived summary chips ─────────────────────────────────────────────── */
  const topProduct   = $derived(analytics?.products?.byRevenue?.[0] ?? null);
  const topCategory  = $derived(analytics?.categories?.[0] ?? null);
  const topPayment   = $derived(paymentRows[0] ?? null);
  const uniqueBuyers = $derived(analytics?.customers?.uniqueBuyers ?? 0);

  /* ── helpers ───────────────────────────────────────────────────────────── */
  function marginTone(margin: number | null | undefined): string {
    if (margin == null) return 'text-[var(--text-3)]';
    if (margin >= 30)   return 'text-[var(--teal-fg)]';
    if (margin >= 15)   return 'text-[var(--gold-fg)]';
    return 'text-[var(--crimson-fg)]';
  }
  function marginBg(margin: number | null | undefined): string {
    if (margin == null) return 'var(--surface2)';
    if (margin >= 30)   return 'var(--teal-dim)';
    if (margin >= 15)   return 'var(--gold-dim)';
    return 'var(--crimson-dim)';
  }

  function trendArrow(d: 'up' | 'down' | 'flat' | undefined) {
    if (d === 'up')   return ArrowUp;
    if (d === 'down') return ArrowDown;
    return Minus;
  }
  function trendTone(d: 'up' | 'down' | 'flat' | undefined): string {
    if (d === 'up')   return 'var(--teal-fg)';
    if (d === 'down') return 'var(--crimson-fg)';
    return 'var(--text-3)';
  }
  function trendBg(d: 'up' | 'down' | 'flat' | undefined): string {
    if (d === 'up')   return 'var(--teal-dim)';
    if (d === 'down') return 'var(--crimson-dim)';
    return 'var(--surface2)';
  }
</script>

<svelte:head><title>Analytics · Shëlf</title></svelte:head>

<div class="fade-up">
  <!-- Header -->
  <div class="flex items-end justify-between gap-3 mb-5">
    <div class="flex-1 min-w-0">
<h1 class="text-[22px] md:text-[26px] font-semibold text-[var(--text)] tracking-tight">
        Analytics
      </h1>
    </div>
  </div>

  <!-- Period selector — horizontally scrollable on mobile -->
  <div class="-mx-5 md:mx-0 mb-5 overflow-x-auto pb-1">
    <div class="flex gap-1.5 px-5 md:px-0 w-max">
      {#each presets as p}
        {@const active = period?.preset === p.value}
        <button
          class="btn btn-sm whitespace-nowrap transition-all {active
            ? 'btn-primary'
            : 'btn-secondary'}"
          onclick={() => goto(`?period=${p.value}`, { invalidateAll: true, replaceState: true })}
        >
          {p.label}
        </button>
      {/each}
    </div>
  </div>

  {#if !analytics}
    <div class="surface-card flex flex-col items-center justify-center h-64 text-[var(--text-3)] anim-in">
      <div class="w-8 h-8 rounded-full border-2 border-[var(--border)] border-t-[var(--primary)] animate-spin mb-3" aria-hidden="true"></div>
      <p class="text-[13px] font-semibold text-[var(--text)]">Crunching your numbers</p>
    </div>
  {:else}
    {@const hasData = (kpis?.transactions?.current ?? 0) > 0 || (kpis?.revenue?.current ?? 0) > 0}

    <div class="space-y-6 anim-stagger">

      {#if !hasData}
        <div class="surface-card flex flex-col items-center justify-center text-center py-14 px-5 anim-in">
          <div class="w-14 h-14 rounded-full flex items-center justify-center mb-3"
               style="background: color-mix(in srgb, var(--primary) 14%, transparent);">
            <BarChart3 size={24} strokeWidth={1.5} style="color:var(--primary)" />
          </div>
          <p class="text-[15px] font-semibold text-[var(--text)]">No data for this period</p>
          <p class="text-[12.5px] text-[var(--text-3)] mt-1 max-w-sm leading-relaxed">
            Once you start ringing up sales, your revenue, profit, and trends will show up here.
          </p>
          <a href="/sale" class="btn btn-primary mt-4">
            <ShoppingCart size={14} strokeWidth={2} />
            Make your first sale
          </a>
        </div>
      {/if}

      <!-- ── 1-line period summary chips ─────────────────────────────────── -->
      {#if hasData}
        <div class="surface-card-flat p-3 flex flex-wrap gap-x-4 gap-y-2 items-center text-xs">
          <span class="inline-flex items-center gap-1.5">
            <Activity size={12} strokeWidth={2} class="text-[var(--text-3)]" />
            <span class="text-[var(--text-3)]">Activity</span>
            <span class="font-semibold">{kpis.transactions.current} sales</span>
          </span>
          <span class="text-[var(--text-3)]">·</span>
          <span class="inline-flex items-center gap-1.5">
            <span class="text-[var(--text-3)]">Avg order</span>
            <span class="font-semibold">{formatCurrencyCompact(kpis.avgOrder.current)}</span>
          </span>
          <span class="text-[var(--text-3)]">·</span>
          <span class="inline-flex items-center gap-1.5">
            <Users size={12} strokeWidth={2} class="text-[var(--text-3)]" />
            <span class="font-semibold">{uniqueBuyers}</span>
            <span class="text-[var(--text-3)]">buyers</span>
          </span>
          {#if topProduct}
            <span class="text-[var(--text-3)]">·</span>
            <span class="inline-flex items-center gap-1.5">
              <Trophy size={12} strokeWidth={2} style="color:var(--gold)" />
              <span class="text-[var(--text-3)]">Top product</span>
              <span class="font-semibold truncate max-w-[160px]">{topProduct.name}</span>
            </span>
          {/if}
          {#if topPayment}
            <span class="text-[var(--text-3)]">·</span>
            <span class="inline-flex items-center gap-1.5">
              <span class="text-[var(--text-3)]">Top method</span>
              <span class="font-semibold">{topPayment.label}</span>
            </span>
          {/if}
        </div>
      {/if}

      <!-- ── §A KPIs ──────────────────────────────────────────────────────── -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3 stagger-fade">
        <KpiCard
          label="Revenue"
          icon="TrendingUp"
          value={formatCurrencyCompact(kpis.revenue.current)}
          trend={kpis.revenue.delta?.pct
            ? { direction: kpis.revenue.delta.direction, label: `${Math.abs(kpis.revenue.delta.pct)}%` }
            : undefined}
          sub="vs prev period"
        />
        <KpiCard
          label="Transactions"
          icon="ShoppingBag"
          value={String(kpis.transactions.current)}
          trend={kpis.transactions.delta?.pct
            ? { direction: kpis.transactions.delta.direction, label: `${Math.abs(kpis.transactions.delta.pct)}%` }
            : undefined}
          sub="vs prev period"
        />
        <KpiCard
          label="Avg Order"
          icon="BarChart3"
          value={formatCurrencyCompact(kpis.avgOrder.current)}
          trend={kpis.avgOrder.delta?.pct
            ? { direction: kpis.avgOrder.delta.direction, label: `${Math.abs(kpis.avgOrder.delta.pct)}%` }
            : undefined}
          sub="vs prev period"
        />
        {#if kpis.margin}
          <KpiCard
            label="Gross Margin"
            icon="Percent"
            value={`${kpis.margin.current.toFixed(1)}%`}
            trend={kpis.margin.delta?.pp
              ? { direction: kpis.margin.delta.direction, label: `${Math.abs(kpis.margin.delta.pp)}pp` }
              : undefined}
            sub="vs prev period"
          />
        {/if}
      </div>

      <!-- ── §A.2 Credit / Receivables ────────────────────────────────────
           Current snapshot of outstanding credit. Not period-filtered —
           these balances accumulate and persist until settled. Only
           rendered when the shop has any outstanding credit. -->
      {#if analytics?.outstanding && analytics.outstanding.total > 0}
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
          <KpiCard
            label="Outstanding Receivables"
            icon="Clock"
            value={formatCurrencyCompact(analytics.outstanding.total)}
            sub={`${analytics.outstanding.byCustomer.length} ${analytics.outstanding.byCustomer.length === 1 ? 'customer' : 'customers'}`}
          />
          <div class="surface-card p-4 md:p-5 space-y-2.5">
            <p class="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-3)]">By Status</p>
            <div class="flex items-center justify-between text-xs">
              <span class="text-[var(--text-2)] flex items-center gap-1.5">
                <span class="w-2 h-2 rounded-full bg-[var(--crimson)]"></span>
                Pending (full)
              </span>
              <span class="font-semibold tabular-nums">
                {formatCurrencyCompact(analytics.outstanding.byStatus.pending ?? 0)}
              </span>
            </div>
            <div class="flex items-center justify-between text-xs">
              <span class="text-[var(--text-2)] flex items-center gap-1.5">
                <span class="w-2 h-2 rounded-full bg-[var(--gold)]"></span>
                Partial
              </span>
              <span class="font-semibold tabular-nums">
                {formatCurrencyCompact(analytics.outstanding.byStatus.partial ?? 0)}
              </span>
            </div>
            <div class="h-px bg-[var(--border)] my-1.5"></div>
            <div class="flex items-center justify-between text-[10px] text-[var(--text-3)]">
              <span>Total outstanding</span>
              <span class="font-bold tabular-nums" style="color:var(--gold)">
                {formatCurrencyCompact(analytics.outstanding.total)}
              </span>
            </div>
          </div>
          <div class="surface-card p-4 md:p-5 space-y-2">
            <p class="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-3)]">Top Customers with Credit</p>
            {#if analytics.outstanding.byCustomer.length === 0}
              <p class="text-xs text-[var(--text-3)]">No customers with outstanding credit.</p>
            {:else}
              <ul class="space-y-1.5">
                {#each analytics.outstanding.byCustomer.slice(0, 4) as c (c.id)}
                  <li class="flex items-center justify-between text-xs">
                    <a href="/customers/{c.id}" class="font-medium text-[var(--text)] truncate hover:text-[var(--primary)]">
                      {c.name}
                    </a>
                    <span class="font-semibold tabular-nums whitespace-nowrap" style="color:var(--gold)">
                      {formatCurrencyCompact(c.outstanding)}
                    </span>
                  </li>
                {/each}
              </ul>
            {/if}
          </div>
        </div>
      {/if}

      <!-- ── §B Profit · Inventory (paired cards) ──────────────────────── -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        {#if grossProfit}
          {@const profitArrow = trendArrow(grossProfit.delta?.direction ?? 'flat')}
          <div class="surface-card p-4 md:p-5 space-y-3">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <div class="w-7 h-7 rounded-lg flex items-center justify-center"
                     style="background:color-mix(in srgb, var(--cobalt) 14%, transparent)">
                  <Banknote size={14} strokeWidth={2} style="color:var(--cobalt)" />
                </div>
                <p class="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-3)]">Gross Profit</p>
              </div>
              {#if grossProfit.delta}
                <span class="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                      style="background:{trendBg(grossProfit.delta.direction)}; color:{trendTone(grossProfit.delta.direction)}">
                  <profitArrow size={10} strokeWidth={2.5}></profitArrow>
                  {Math.abs(grossProfit.delta.pct)}%
                </span>
              {/if}
            </div>
            <p class="text-xl font-bold tabular-nums">{formatCurrencyCompact(grossProfit.current)}</p>
            <p class="text-[10px] text-[var(--text-3)]">vs {formatCurrencyCompact(grossProfit.previous)} prev period</p>
            {#if grossProfit.coverage !== undefined && grossProfit.coverage < 80}
              <p class="text-[10px] text-[var(--gold-fg)]" title="Items with cost data available">
                ⚠ Cost data on {grossProfit.coverage}% of items
              </p>
            {/if}
          </div>
        {/if}

        {#if stockValue}
          <div class="surface-card p-4 md:p-5 space-y-3">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <div class="w-7 h-7 rounded-lg flex items-center justify-center"
                     style="background:color-mix(in srgb, var(--primary) 14%, transparent)">
                  <Package size={14} strokeWidth={2} style="color:var(--primary)" />
                </div>
                <p class="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-3)]">Inventory Value</p>
              </div>
              <span class="text-[10px] font-semibold tabular-nums" style="color:var(--cobalt-fg)">
                {stockValue.potentialMargin.toFixed(1)}% margin
              </span>
            </div>
            <div class="flex items-end justify-between gap-2">
              <div>
                <p class="text-[10px] text-[var(--text-3)]">At retail</p>
                <p class="text-lg font-bold tabular-nums leading-tight">{formatCurrencyCompact(stockValue.retailValue)}</p>
              </div>
              <div class="text-right">
                <p class="text-[10px] text-[var(--text-3)]">At cost</p>
                <p class="text-sm font-semibold tabular-nums leading-tight text-[var(--text-2)]">{formatCurrencyCompact(stockValue.costValue)}</p>
              </div>
            </div>
            <div class="flex items-center gap-3">
              <div class="flex-1 h-1.5 rounded-full bg-[var(--surface2)] overflow-hidden">
                <div class="h-full rounded-full"
                     style="width:{Math.min(100, stockValue.potentialMargin).toFixed(1)}%; background:var(--cobalt)"></div>
              </div>
              <p class="text-[10px] text-[var(--text-3)] whitespace-nowrap">{stockValue.totalUnits.toLocaleString()} units</p>
            </div>
          </div>
        {/if}
      </div>

      <!-- ── §C Performance Trend ───────────────────────────────────────── -->
      <div class="surface-card p-4 md:p-5 space-y-4">
        <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div class="flex items-center gap-2">
            <div class="w-7 h-7 rounded-lg flex items-center justify-center"
                 style="background:color-mix(in srgb, var(--primary) 14%, transparent)">
              <TrendingUp size={14} strokeWidth={2} style="color:var(--primary)" />
            </div>
            <h3 class="font-semibold text-[13.5px] text-[var(--text)] tracking-tight">
              {activeMetric === 'revenue' ? 'Revenue Trend'
                : activeMetric === 'transactions' ? 'Transaction Volume'
                : 'Average Order Value'}
            </h3>
          </div>
          <div class="inline-flex gap-1 bg-[var(--surface2)] p-1 rounded-lg">
            {#each metricTabs as tab}
              {@const active = activeMetric === tab.key}
              <button
                class="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold rounded-md transition-all"
                style="background:{active ? 'var(--primary)' : 'transparent'};
                       color:{active ? 'var(--primary-fg)' : 'var(--text-2)'}"
                onclick={() => (activeMetric = tab.key)}
              >
                <DynamicIcon name={tab.icon} size={11} strokeWidth={2} />
                {tab.label}
              </button>
            {/each}
          </div>
        </div>
        <div class="h-72 w-full">
          <AreaChart
            labels={trendLabels}
            datasets={trendDatasets}
            yFormat={activeMetric === 'transactions' ? 'count' : 'currency'}
            height={288}
          />
        </div>
      </div>

      <!-- ── §D Yearly Trend + §E Time Distribution (2/1 split) ──────────── -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <!-- Yearly trend (2/3) -->
        <div class="surface-card p-4 md:p-5 space-y-4 lg:col-span-2">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <div class="w-7 h-7 rounded-lg flex items-center justify-center"
                   style="background:color-mix(in srgb, var(--cobalt) 14%, transparent)">
                <BarChart3 size={14} strokeWidth={2} style="color:var(--cobalt)" />
              </div>
              <div>
                <h3 class="font-semibold text-[13.5px] text-[var(--text)] tracking-tight">12-Month Trend</h3>
                <p class="text-[10px] text-[var(--text-3)]">Rolling yearly revenue</p>
              </div>
            </div>
            <span class="badge badge-neutral text-[10px]">
              {monthlyLabels.length} month{monthlyLabels.length === 1 ? '' : 's'}
            </span>
          </div>
          <div class="h-56 w-full">
            <BarChart
              labels={monthlyLabels}
              data={monthlyRevData}
              color="var(--cobalt)"
              height={224}
              yFormat="currency"
              highlightLast
            />
          </div>
        </div>

        <!-- Payment Methods (1/3) -->
        <div class="surface-card p-4 md:p-5 space-y-4">
          <div class="flex items-center gap-2">
            <div class="w-7 h-7 rounded-lg flex items-center justify-center"
                 style="background:color-mix(in srgb, var(--primary) 14%, transparent)">
              <PieChart size={14} strokeWidth={2} style="color:var(--primary)" />
            </div>
            <h3 class="font-semibold text-[13.5px] text-[var(--text)] tracking-tight">Payment Methods</h3>
          </div>
          {#if paymentRows.length === 0}
            <p class="text-xs text-[var(--text-3)] py-8 text-center">No payments in this period.</p>
          {:else}
            {@const totalPaymentRev = paymentRows.reduce((s: number, p: any) => s + (p.revenue ?? 0), 0)}
            <div class="h-44 w-full">
              <DonutChart
                labels={paymentRows.map((pm: any) => pm.label)}
                data={paymentRows.map((pm: any) => pm.revenue ?? 0)}
                centerValue={formatCurrency(totalPaymentRev)}
                centerLabel="total"
              />
            </div>
            <div class="space-y-1.5 pt-2">
              {#each paymentRows as pm, i}
                <div class="flex items-center justify-between text-[12px]">
                  <span class="flex items-center gap-2 text-[var(--text-2)] truncate">
                    <span class="w-2 h-2 rounded-sm shrink-0"
                          style="background:{['var(--primary)','var(--cobalt)','var(--gold)','var(--rose)','var(--crimson)','var(--teal)'][i % 6]}"></span>
                    {pm.label}
                  </span>
                  <span class="font-semibold tabular-nums shrink-0">{formatCurrency(pm.revenue)}</span>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      </div>

      <!-- ── §E Sales Calendar (25%) + Busiest Times (75%) ──────────────── -->
      <div class="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <!-- Calendar (left, 25%) -->
        <div class="surface-card p-4 md:p-5 space-y-4 lg:col-span-1">
          <div class="flex items-center justify-between gap-3 flex-wrap">
            <div class="flex items-center gap-2">
              <div class="w-7 h-7 rounded-lg flex items-center justify-center"
                   style="background:color-mix(in srgb, var(--teal) 14%, transparent)">
                <Calendar size={14} strokeWidth={2} style="color:var(--teal)" />
              </div>
              <div>
                <h3 class="font-semibold text-[13.5px] text-[var(--text)] tracking-tight">Sales Calendar</h3>
                <p class="text-[10px] text-[var(--text-3)]">Daily revenue, last 84 days</p>
              </div>
            </div>
            {#if calendar?.hasData}
              <div class="flex items-center gap-2 text-[10px] text-[var(--text-3)]">
                <span class="font-semibold text-[var(--text)] tabular-nums">{formatCurrencyCompact(calendar.total)}</span>
                <span>in this period</span>
              </div>
            {/if}
          </div>

          {#if !calendar}
            <div class="aspect-[5/3] flex items-center justify-center text-[12px] text-[var(--text-3)]">
              No calendar data available.
            </div>
          {:else if !calendar.hasData}
            <div class="aspect-[5/3] flex items-center justify-center text-[12px] text-[var(--text-3)]">
              No sales in the last 84 days. Make your first sale to see your activity here.
            </div>
          {:else}
            {@const weeks = Math.min(calendar.weeks, 12)}
            {@const startIdx = (calendar.weeks - weeks) * 7}
            {@const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']}
            {@const cellSlice = calendar.cells.slice(startIdx)}
            {@const maxV = cellSlice.reduce((m: number, c: any) => Math.max(m, c.value), 0) || 1}
            {@const lastCell = cellSlice.findLast?.((c: any) => c.date) ?? [...cellSlice].reverse().find((c: any) => c.date)}
            {@const firstCell = cellSlice.find((c: any) => c.date)}
            {@const fmtShort = (iso: string) => {
              if (!iso) return '';
              const [y, m, d] = iso.split('-').map(Number);
              const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
              return `${months[m - 1]} ${d}`;
            }}
            <div class="w-full aspect-[5/3]">
              <!-- Date range above the grid -->
              {#if firstCell?.date && lastCell?.date}
                <div class="flex items-center justify-between text-[9px] text-[var(--text-3)] font-medium mb-1 pl-[22px]">
                  <span>{fmtShort(firstCell.date)}</span>
                  <span>{fmtShort(lastCell.date)}</span>
                </div>
              {/if}
              <div class="flex h-[calc(100%-14px)]">
                <!-- Day-of-week labels -->
                <div class="flex flex-col justify-between mr-1.5 text-[9px] text-[var(--text-3)] font-medium shrink-0"
                     style="width: 18px;">
                  {#each dayLabels as l, i}
                    <div class="leading-none"
                         style="visibility: {i % 2 === 1 ? 'visible' : 'hidden'};">
                      {l}
                    </div>
                  {/each}
                </div>

                <!-- Square grid: 12 cols × 7 rows -->
                <div class="flex-1 grid"
                     style="grid-template-columns: repeat({weeks}, 1fr); grid-template-rows: repeat(7, 1fr); gap: 2px;">
                  {#each cellSlice as c, idx}
                    {#if idx >= weeks * 7}
                      <!-- skip future padding beyond 12 weeks -->
                    {:else}
                      {@const v = c.value}
                      {@const intensity = v > 0 ? Math.max(0.15, v / maxV) : 0}
                      {@const dayLabel = dayLabels[c.dow]}
                      {@const isFuture = !c.date}
                      <div
                        class="rounded-[2px] transition-transform hover:scale-150 hover:z-10 relative cursor-default
                               {isFuture ? 'opacity-30' : ''}"
                        style="background: {v > 0
                          ? `color-mix(in srgb, var(--teal) ${Math.round(intensity * 100)}%, var(--surface2))`
                          : 'color-mix(in srgb, var(--surface2) 80%, transparent)'};"
                        title={c.date
                          ? `${dayLabel} ${c.date}\n${formatCurrency(c.value)} · ${c.count} sale${c.count === 1 ? '' : 's'}`
                          : ''}
                      ></div>
                    {/if}
                  {/each}
                </div>
              </div>
            </div>
            <div class="flex items-center justify-end gap-1.5 text-[10px] text-[var(--text-3)]">
              <span>Less</span>
              <div class="flex gap-0.5">
                {#each [0, 1, 2, 3, 4] as i}
                  <div class="w-3 h-3 rounded-sm"
                       style="background:color-mix(in srgb, var(--teal) {15 + i * 18}%, var(--surface2))"></div>
                {/each}
              </div>
              <span>More</span>
            </div>
          {/if}
        </div>

        <!-- Busiest Times (right, 75%) -->
        <div class="surface-card p-4 md:p-5 space-y-4 lg:col-span-3">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <div class="w-7 h-7 rounded-lg flex items-center justify-center"
                   style="background:color-mix(in srgb, var(--primary) 14%, transparent)">
                <Activity size={14} strokeWidth={2} style="color:var(--primary)" />
              </div>
              <div>
                <h3 class="font-semibold text-[13.5px] text-[var(--text)] tracking-tight">Busiest Times</h3>
                <p class="text-[10px] text-[var(--text-3)]">Average revenue by hour-of-day and day-of-week</p>
              </div>
            </div>
            <div class="flex items-center gap-1.5 text-[10px] text-[var(--text-3)]">
              <span>Less</span>
              <div class="flex gap-0.5">
                {#each [0, 1, 2, 3, 4] as i}
                  <div class="w-3 h-3 rounded-sm"
                       style="background:color-mix(in srgb, var(--primary) {20 + i * 16}%, var(--surface2))"></div>
                {/each}
              </div>
              <span>More</span>
            </div>
          </div>
          <Heatmap values={heatmapValues} hours={Array.from({ length: 24 }, (_, i) => `${i}`)} />
        </div>
      </div>

      <!-- ── §F Product Performance ─────────────────────────────────────── -->
      <div class="surface-card p-4 md:p-5 space-y-4">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <div class="w-7 h-7 rounded-lg flex items-center justify-center"
                 style="background:color-mix(in srgb, var(--primary) 14%, transparent)">
              <Package size={14} strokeWidth={2} style="color:var(--primary)" />
            </div>
            <div>
              <h3 class="font-semibold text-[13.5px] text-[var(--text)] tracking-tight">Top Products</h3>
              <p class="text-[10px] text-[var(--text-3)]">By revenue this period</p>
            </div>
          </div>
        </div>
        <div class="overflow-x-auto">
          <table class="tbl w-full">
            <thead>
              <tr>
                <th class="w-10 text-left">#</th>
                <th class="text-left">Product</th>
                <th class="text-right">Revenue</th>
                <th class="text-right">Units</th>
                <th class="text-right">Margin</th>
              </tr>
            </thead>
            <tbody>
              {#each analytics.products?.byRevenue ?? [] as product, i}
                <tr>
                  <td>
                    <span class="inline-flex items-center justify-center w-6 h-6 rounded-md text-[11px] font-bold font-mono"
                          style="background:{i < 3 ? 'var(--gold-dim)' : 'var(--surface2)'};
                                 color:{i < 3 ? 'var(--gold-fg)' : 'var(--text-3)'}">
                      {i + 1}
                    </span>
                  </td>
                  <td class="font-medium">{product.name ?? '—'}</td>
                  <td class="text-right font-semibold tabular-nums">{formatCurrency(product.revenue)}</td>
                  <td class="text-right tabular-nums text-[var(--text-2)]">{product.units}</td>
                  <td class="text-right">
                    {#if product.margin != null}
                      <span class="inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold tabular-nums"
                            style="background:{marginBg(product.margin)}; color:{marginTone(product.margin)}">
                        {product.margin.toFixed(1)}%
                      </span>
                    {:else}
                      <span class="text-[var(--text-3)]">—</span>
                    {/if}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>

      <!-- ── §G Categories ──────────────────────────────────────────────── -->
      {#if (analytics.categories ?? []).length > 0}
        <div class="surface-card p-4 md:p-5 space-y-4">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <div class="w-7 h-7 rounded-lg flex items-center justify-center"
                   style="background:color-mix(in srgb, var(--cobalt) 14%, transparent)">
                <BarChart3 size={14} strokeWidth={2} style="color:var(--cobalt)" />
              </div>
              <div>
                <h3 class="font-semibold text-[13.5px] text-[var(--text)] tracking-tight">Categories</h3>
                <p class="text-[10px] text-[var(--text-3)]">Revenue, units, and margin by category</p>
              </div>
            </div>
          </div>
          <div class="overflow-x-auto">
            <table class="tbl w-full">
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
                {#each analytics.categories as cat}
                  <tr>
                    <td class="font-medium">{cat.name}</td>
                    <td class="text-right font-semibold tabular-nums">{formatCurrency(cat.revenue)}</td>
                    <td class="text-right tabular-nums text-[var(--text-2)]">{cat.units}</td>
                    <td class="text-right tabular-nums text-[var(--text-2)]">
                      {formatCurrency(Math.round(cat.revenue / (cat.units || 1)))}
                    </td>
                    <td class="text-right">
                      {#if cat.margin != null}
                        <span class="inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold tabular-nums"
                              style="background:{marginBg(cat.margin)}; color:{marginTone(cat.margin)}">
                          {cat.margin.toFixed(1)}%
                        </span>
                      {:else}
                        <span class="text-[var(--text-3)]">—</span>
                      {/if}
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>
      {/if}

      <!-- ── §H Customers ───────────────────────────────────────────────── -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div class="surface-card p-4 md:p-5 space-y-4">
          <div class="flex items-center gap-2">
            <div class="w-7 h-7 rounded-lg flex items-center justify-center"
                 style="background:color-mix(in srgb, var(--primary) 14%, transparent)">
              <Users size={14} strokeWidth={2} style="color:var(--primary)" />
            </div>
            <div>
              <h3 class="font-semibold text-[13.5px] text-[var(--text)] tracking-tight">Customers</h3>
              <p class="text-[10px] text-[var(--text-3)]">{uniqueBuyers} unique buyers</p>
            </div>
          </div>
          <div class="grid grid-cols-3 gap-2">
            <div class="rounded-lg p-3 text-center"
                 style="background:color-mix(in srgb, var(--gold) 12%, transparent)">
              <p class="text-[10px] font-bold uppercase tracking-wide" style="color:var(--gold-fg)">VIP</p>
              <p class="text-lg font-bold tabular-nums mt-1">{customerTiers?.vip ?? 0}</p>
            </div>
            <div class="rounded-lg p-3 text-center"
                 style="background:color-mix(in srgb, var(--primary) 10%, transparent)">
              <p class="text-[10px] font-bold uppercase tracking-wide">Regular</p>
              <p class="text-lg font-bold tabular-nums mt-1">{customerTiers?.regular ?? 0}</p>
            </div>
            <div class="rounded-lg p-3 text-center"
                 style="background:var(--surface2)">
              <p class="text-[10px] font-bold uppercase tracking-wide text-[var(--text-3)]">New</p>
              <p class="text-lg font-bold tabular-nums mt-1">{customerTiers?.new ?? 0}</p>
            </div>
          </div>
          <p class="text-[10px] text-[var(--text-3)] text-center">Tiers based on lifetime spend</p>
        </div>

        <div class="surface-card p-4 md:p-5 md:col-span-2 space-y-4">
          <div class="flex items-center gap-2">
            <div class="w-7 h-7 rounded-lg flex items-center justify-center"
                 style="background:color-mix(in srgb, var(--gold) 14%, transparent)">
              <Trophy size={14} strokeWidth={2} style="color:var(--gold)" />
            </div>
            <div>
              <h3 class="font-semibold text-[13.5px] text-[var(--text)] tracking-tight">Top Customers</h3>
              <p class="text-[10px] text-[var(--text-3)]">By spend this period</p>
            </div>
          </div>
          <div class="overflow-x-auto">
            <table class="tbl w-full">
              <thead>
                <tr>
                  <th class="w-10 text-left">#</th>
                  <th class="text-left">Name</th>
                  <th class="text-right">Spent</th>
                  <th class="text-right">Visits</th>
                </tr>
              </thead>
              <tbody>
                {#each leaderboard as customer, i}
                  <tr>
                    <td>
                      <span class="inline-flex items-center justify-center w-6 h-6 rounded-md text-[11px] font-bold font-mono"
                            style="background:{i < 3 ? 'var(--gold-dim)' : 'var(--surface2)'};
                                   color:{i < 3 ? 'var(--gold-fg)' : 'var(--text-3)'}">
                        {i + 1}
                      </span>
                    </td>
                    <td class="font-medium">{customer.name ?? '—'}</td>
                    <td class="text-right font-semibold tabular-nums">{formatCurrency(customer.spent)}</td>
                    <td class="text-right tabular-nums text-[var(--text-2)]">{customer.visits}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>
      </div>

    </div>
  {/if}
</div>
