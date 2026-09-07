<script lang="ts">
  import { formatCurrency, formatCurrencyCompact, formatDateTime } from "$lib/utils/format";
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import KpiCard from "$lib/components/ui/KpiCard.svelte";
  import {
    Calendar, FileText, Receipt, ChevronLeft, ChevronRight,
    ArrowUp, ArrowDown, Minus, Search, ArrowUpDown,
    TrendingUp, Banknote, Package, Percent,
  } from "lucide-svelte";

  let { data } = $props();

  const pnl = $derived((data as any).pnl);
  const tab = $derived(pnl?.tab ?? 'calendar');
  const fromCache = $derived((data as any).fromCache ?? false);
  const refreshing = $derived((data as any).refreshing ?? false);

  // ── Cache hydration on mount ─────────────────────────────────────────────
  $effect(() => {
    if (!pnl) return;

    // Build cache key from current URL params
    const params = new URLSearchParams(window.location.search);
    const cacheKey = `pnl:${params.get('period') ?? '7d'}:${params.get('tab') ?? 'calendar'}:${params.get('month') ?? ''}`;

    // Write to IndexedDB in background (non-blocking)
    import('$lib/offline/cacheFirst').then(({ cache }) => {
      cache.write('sale_items', cacheKey, pnl).catch(() => {});
    }).catch(() => {});
  });

  // ── Tab navigation ─────────────────────────────────────────────────────
  const tabs = [
    { key: 'calendar', label: 'Calendar',    icon: Calendar },
    { key: 'report',   label: 'Report',      icon: FileText },
    { key: 'bills',    label: 'Bill-by-Bill', icon: Receipt },
  ] as const;

  function setTab(t: string) {
    const u = new URL($page.url);
    u.searchParams.set('tab', t);
    goto(u.toString(), { invalidateAll: true, replaceState: true });
  }

  // ── Period presets (for report + bills) ─────────────────────────────────
  const presets = [
    { label: "Today",      value: "today" },
    { label: "7 days",     value: "7d" },
    { label: "30 days",    value: "30d" },
    { label: "90 days",    value: "90d" },
    { label: "This Month", value: "this_month" },
    { label: "Last Month", value: "last_month" },
    { label: "This Year",  value: "this_year" },
  ];

  function setPeriod(preset: string) {
    const u = new URL($page.url);
    u.searchParams.set('period', preset);
    u.searchParams.set('tab', tab);
    goto(u.toString(), { invalidateAll: true, replaceState: true });
  }

  // ── Calendar navigation ────────────────────────────────────────────────
  function navMonth(dir: -1 | 1) {
    const [y, m] = (pnl?.calendarMonth ?? '').split('-').map(Number);
    const d = new Date(y, m - 1 + dir, 1);
    const mm = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const u = new URL($page.url);
    u.searchParams.set('month', mm);
    u.searchParams.set('tab', 'calendar');
    goto(u.toString(), { invalidateAll: true, replaceState: true });
  }

  // ── Calendar expand state ──────────────────────────────────────────────
  let expandedDate = $state<string | null>(null);

  // ── Bills: search, sort, pagination ────────────────────────────────────
  let billSearch = $state('');
  let billSortKey = $state<'date' | 'revenue' | 'cogs' | 'profit' | 'margin'>('date');
  let billSortDir = $state<'asc' | 'desc'>('desc');
  let billPage = $state(0);
  const PAGE_SIZE = 50;

  const filteredBills = $derived(() => {
    const bills = pnl?.bills ?? [];
    const q = billSearch.toLowerCase().trim();
    const filtered = q
      ? bills.filter((b: any) =>
          b.ref.toLowerCase().includes(q) ||
          (b.customer ?? '').toLowerCase().includes(q))
      : bills;

    const sorted = [...filtered].sort((a: any, b: any) => {
      let cmp = 0;
      switch (billSortKey) {
        case 'date':    cmp = a.date.localeCompare(b.date); break;
        case 'revenue': cmp = a.revenue - b.revenue; break;
        case 'cogs':    cmp = a.cogs - b.cogs; break;
        case 'profit':  cmp = a.profit - b.profit; break;
        case 'margin':  cmp = a.margin - b.margin; break;
      }
      return billSortDir === 'desc' ? -cmp : cmp;
    });

    return sorted;
  });

  const pagedBills = $derived(() => {
    const all = filteredBills();
    return all.slice(billPage * PAGE_SIZE, (billPage + 1) * PAGE_SIZE);
  });

  const totalPages = $derived(Math.ceil((filteredBills()?.length ?? 0) / PAGE_SIZE));

  const runningTotal = $derived(() => {
    const all = filteredBills();
    return {
      revenue: all.reduce((s: number, b: any) => s + b.revenue, 0),
      cogs:    all.reduce((s: number, b: any) => s + b.cogs, 0),
      profit:  all.reduce((s: number, b: any) => s + b.profit, 0),
    };
  });

  function toggleSort(key: typeof billSortKey) {
    if (billSortKey === key) {
      billSortDir = billSortDir === 'desc' ? 'asc' : 'desc';
    } else {
      billSortKey = key;
      billSortDir = 'desc';
    }
    billPage = 0;
  }

  // ── Helpers ────────────────────────────────────────────────────────────
  function profitColor(profit: number, max: number): string {
    if (profit === 0) return 'var(--surface2)';
    const intensity = Math.max(18, Math.round((Math.abs(profit) / (max || 1)) * 100));
    return profit > 0
      ? `color-mix(in srgb, var(--teal) ${intensity}%, var(--surface2))`
      : `color-mix(in srgb, var(--crimson) ${intensity}%, var(--surface2))`;
  }

  function profitTextColor(profit: number, isFuture: boolean): string {
    if (isFuture) return 'var(--text-3)';
    if (profit > 0) return 'var(--primary-fg)';
    if (profit < 0) return 'var(--primary-fg)';
    return 'var(--text-2)';
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

  function marginTone(m: number): string {
    if (m >= 30)  return 'text-[var(--teal-fg)]';
    if (m >= 15)  return 'text-[var(--gold-fg)]';
    return 'text-[var(--crimson-fg)]';
  }
  function marginBg(m: number): string {
    if (m >= 30)  return 'var(--teal-dim)';
    if (m >= 15)  return 'var(--gold-dim)';
    return 'var(--crimson-dim)';
  }
</script>

<svelte:head><title>P&L Report · Shëlf</title></svelte:head>

<div class="fade-up">
  <!-- Header -->
  <div class="flex items-end justify-between gap-3 mb-5">
    <div class="flex-1 min-w-0">
      <h1 class="text-[22px] md:text-[26px] font-semibold text-[var(--text)] tracking-tight">
        Profit & Loss
      </h1>
    </div>
    <a href="/analytics" class="btn btn-sm btn-secondary">← Analytics</a>
  </div>

  <!-- Tab bar -->
  <div class="inline-flex gap-1 bg-[var(--surface2)] p-1 rounded-lg mb-5">
    {#each tabs as t}
      {@const active = tab === t.key}
      <button
        class="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold rounded-md transition-all"
        style="background:{active ? 'var(--primary)' : 'transparent'};
               color:{active ? 'var(--primary-fg)' : 'var(--text-2)'}"
        onclick={() => setTab(t.key)}
      >
        <t.icon size={13} strokeWidth={2} />
        {t.label}
      </button>
    {/each}
  </div>

  {#if !pnl}
    <div class="surface-card flex flex-col items-center justify-center h-64 text-[var(--text-3)] anim-in">
      <div class="w-8 h-8 rounded-full border-2 border-[var(--border)] border-t-[var(--primary)] animate-spin mb-3" aria-hidden="true"></div>
      <p class="text-[13px] font-semibold text-[var(--text)]">Loading P&L data</p>
    </div>

  <!--
    ════════════════════════════════════════════════════════════════════
    §1  CALENDAR VIEW
    ════════════════════════════════════════════════════════════════════
  -->
  {:else if tab === 'calendar'}
    {@const cal = pnl.profitCalendar}
    <div class="space-y-4 anim-stagger">
      <!-- Month navigator -->
      <div class="surface-card p-4 md:p-5">
        <div class="flex items-center justify-between mb-4">
          <button class="btn btn-sm btn-secondary" onclick={() => navMonth(-1)}>
            <ChevronLeft size={14} strokeWidth={2} /> Prev
          </button>
          <h2 class="text-[15px] font-semibold text-[var(--text)]">{cal.monthLabel}</h2>
          <button class="btn btn-sm btn-secondary" onclick={() => navMonth(1)}>
            Next <ChevronRight size={14} strokeWidth={2} />
          </button>
        </div>

        {#if !cal.hasData}
          <div class="h-48 flex items-center justify-center text-[12px] text-[var(--text-3)]">
            No sales data for {cal.monthLabel}.
          </div>
        {:else}
          {@const dayLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S']}
          <!-- Day-of-week header -->
          <div class="grid grid-cols-7 gap-1 text-[9px] text-[var(--text-3)] font-medium text-center mb-1">
            {#each dayLabels as l}
              <div>{l}</div>
            {/each}
          </div>

          <!-- Calendar grid -->
          <div class="grid grid-cols-7 gap-1"
               style="grid-template-rows: repeat({cal.weeks}, minmax(0, 1fr));">
            {#each cal.cells as c}
              {#if c.date}
                <button
                  class="rounded-md flex flex-col items-center justify-center py-2 text-[11px] font-semibold tabular-nums
                         transition-all hover:scale-105 relative cursor-pointer min-h-[44px]
                         {c.isToday ? 'ring-1 ring-[var(--primary)] ring-offset-1 ring-offset-[var(--surface)]' : ''}"
                  style="background: {c.isFuture ? 'transparent' : profitColor(c.profit, cal.max)};
                         border: {c.isFuture ? '1px dashed color-mix(in srgb, var(--text-3) 35%, transparent)' : '1px solid transparent'};
                         color: {profitTextColor(c.profit, c.isFuture)};"
                  title="{c.day} · {c.date}{c.isFuture ? '\n(future)' : `\nProfit: ${formatCurrency(c.profit)}\nRevenue: ${formatCurrency(c.revenue)}\nCOGS: ${formatCurrency(c.cogs)}\n${c.count} sale${c.count === 1 ? '' : 's'}`}"
                  onclick={() => { expandedDate = expandedDate === c.date ? null : c.date; }}
                >
                  <span>{c.day}</span>
                  {#if !c.isFuture && c.count > 0}
                    <span class="text-[8px] opacity-80">{formatCurrencyCompact(c.profit)}</span>
                  {/if}
                </button>
              {:else}
                <div aria-hidden="true"></div>
              {/if}
            {/each}
          </div>

          <!-- Legend -->
          <div class="flex items-center justify-between mt-3">
            <div class="flex items-center gap-1.5 text-[10px] text-[var(--text-3)]">
              <span>Loss</span>
              <div class="flex gap-0.5">
                {#each [0, 1, 2, 3] as i}
                  <div class="w-3 h-3 rounded-sm"
                       style="background:color-mix(in srgb, var(--crimson) {20 + i * 22}%, var(--surface2))"></div>
                {/each}
              </div>
              <span class="mx-1">|</span>
              <div class="flex gap-0.5">
                {#each [0, 1, 2, 3] as i}
                  <div class="w-3 h-3 rounded-sm"
                       style="background:color-mix(in srgb, var(--teal) {20 + i * 22}%, var(--surface2))"></div>
                {/each}
              </div>
              <span>Profit</span>
            </div>
          </div>

          <!-- Day expansion (sales of a clicked day) -->
          {#if expandedDate && cal.daySales?.[expandedDate]?.length}
            <div class="mt-3 pt-3 border-t border-[var(--border)] space-y-1.5">
              <p class="text-[11px] font-semibold text-[var(--text-3)] uppercase tracking-wide">
                Sales on {expandedDate}
              </p>
              {#each cal.daySales[expandedDate] as s}
                {@const profitSign = s.profit >= 0 ? 'teal' : 'crimson'}
                <div class="flex items-center justify-between text-[12px] py-1 px-2 rounded-md bg-[var(--surface2)]">
                  <a href="/history/{s.saleId}" class="font-mono text-[var(--text-2)] hover:text-[var(--primary)]">
                    {s.saleId.slice(0, 8)}
                  </a>
                  <div class="flex items-center gap-3">
                    <span class="text-[var(--text-3)] tabular-nums">{formatCurrencyCompact(s.revenue)}</span>
                    <span class="font-semibold tabular-nums" style="color:var(--{profitSign}-fg)">
                      {s.profit >= 0 ? '+' : ''}{formatCurrencyCompact(s.profit)}
                    </span>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        {/if}
      </div>

      <!-- Month summary KPIs -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Revenue" icon="TrendingUp" display={formatCurrencyCompact(cal.totalRev)} sub={cal.monthLabel} />
        <KpiCard label="COGS" icon="Package" display={formatCurrencyCompact(cal.totalCogs)} sub="cost of goods" />
        <KpiCard label="Gross Profit" icon="Banknote"
                 display={formatCurrencyCompact(cal.totalProfit)}
                 iconColor={cal.totalProfit >= 0 ? 'var(--teal)' : 'var(--crimson)'}
                 sub={cal.monthLabel} />
        <KpiCard label="Margin" icon="Percent"
                 display={cal.totalRev > 0 ? `${(((cal.totalRev - cal.totalCogs) / cal.totalRev) * 100).toFixed(1)}%` : '—'}
                 sub="gross margin" />
      </div>
    </div>

  <!--
    ════════════════════════════════════════════════════════════════════
    §2  DETAILED REPORT VIEW
    ════════════════════════════════════════════════════════════════════
  -->
  {:else if tab === 'report'}
    {@const k = pnl.kpis}
    <div class="space-y-4 anim-stagger">
      <!-- Period selector -->
      <div class="-mx-5 md:mx-0 overflow-x-auto pb-1">
        <div class="flex gap-1.5 px-5 md:px-0 w-max">
          {#each presets as p}
            {@const active = pnl.period?.preset === p.value}
            <button
              class="btn btn-sm whitespace-nowrap transition-all {active ? 'btn-primary' : 'btn-secondary'}"
              onclick={() => setPeriod(p.value)}
            >
              {p.label}
            </button>
          {/each}
        </div>
      </div>

      <!-- KPI row -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Revenue" icon="TrendingUp"
                 display={formatCurrencyCompact(k.revenue.current)}
                 trend={k.revenue.delta?.pct ? { direction: k.revenue.delta.direction, label: `${k.revenue.delta.pct}%` } : undefined}
                 sub="vs prev period" />
        <KpiCard label="COGS" icon="Package"
                 display={formatCurrencyCompact(k.cogs.current)}
                 trend={k.cogs.delta?.pct ? { direction: k.cogs.delta.direction, label: `${k.cogs.delta.pct}%` } : undefined}
                 sub="vs prev period" />
        <KpiCard label="Gross Profit" icon="Banknote"
                 display={formatCurrencyCompact(k.profit.current)}
                 iconColor={k.profit.current >= 0 ? 'var(--teal)' : 'var(--crimson)'}
                 trend={k.profit.delta?.pct ? { direction: k.profit.delta.direction, label: `${k.profit.delta.pct}%` } : undefined}
                 sub="vs prev period" />
        <KpiCard label="Margin" icon="Percent"
                 display={`${k.margin.current.toFixed(1)}%`}
                 trend={k.margin.delta?.pct ? { direction: k.margin.delta.direction, label: `${k.margin.delta.pct}%` } : undefined}
                 sub="vs prev period" />
      </div>

      <!-- Coverage warning -->
      {#if k.coverage < 80}
        <div class="surface-card-flat p-3 text-[11px] text-[var(--gold-fg)] flex items-center gap-2">
          <span>⚠</span>
          <span>Cost data available for {k.coverage}% of line items. Margin figures may be understated.</span>
        </div>
      {/if}

      <!-- Comparison vs previous period -->
      <div class="surface-card p-4 md:p-5 space-y-3">
        <h3 class="text-[13px] font-semibold text-[var(--text)]">Period Comparison</h3>
        <div class="overflow-x-auto">
          <table class="tbl w-full">
            <thead>
              <tr>
                <th class="text-left">Metric</th>
                <th class="text-right">Current</th>
                <th class="text-right">Previous</th>
                <th class="text-right">Change</th>
              </tr>
            </thead>
            <tbody>
              {#each [
                { label: 'Revenue', cur: k.revenue.current, prev: k.revenue.previous, d: k.revenue.delta, fmt: formatCurrencyCompact },
                { label: 'COGS', cur: k.cogs.current, prev: k.cogs.previous, d: k.cogs.delta, fmt: formatCurrencyCompact },
                { label: 'Gross Profit', cur: k.profit.current, prev: k.profit.previous, d: k.profit.delta, fmt: formatCurrencyCompact },
                { label: 'Margin %', cur: k.margin.current, prev: k.margin.previous, d: k.margin.delta, fmt: (v: number) => `${v.toFixed(1)}%` },
              ] as row}
                <tr>
                  <td class="font-medium">{row.label}</td>
                  <td class="text-right font-semibold tabular-nums">{row.fmt(row.cur)}</td>
                  <td class="text-right tabular-nums text-[var(--text-2)]">{row.fmt(row.prev)}</td>
                  <td class="text-right">
                    {#if row.d?.pct}
                      {@const DeltaIcon = trendArrow(row.d.direction)}
                      <span class="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                            style="background:{trendBg(row.d.direction)}; color:{trendTone(row.d.direction)}">
                        <DeltaIcon size={10} strokeWidth={2.5} />
                        {row.d.pct}%
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

      <!-- Day-by-day breakdown -->
      <div class="surface-card p-4 md:p-5 space-y-3">
        <h3 class="text-[13px] font-semibold text-[var(--text)]">Daily Breakdown</h3>
        {#if pnl.dailyRows.length === 0}
          <p class="text-xs text-[var(--text-3)] py-4 text-center">No sales data for this period.</p>
        {:else}
          <div class="overflow-x-auto max-h-[400px] overflow-y-auto">
            <table class="tbl w-full">
              <thead class="sticky top-0 bg-[var(--surface)]">
                <tr>
                  <th class="text-left">Date</th>
                  <th class="text-right">Sales</th>
                  <th class="text-right">Revenue</th>
                  <th class="text-right">COGS</th>
                  <th class="text-right">Profit</th>
                  <th class="text-right">Margin</th>
                </tr>
              </thead>
              <tbody>
                {#each pnl.dailyRows as row}
                  <tr>
                    <td class="font-medium whitespace-nowrap">{row.label}</td>
                    <td class="text-right tabular-nums text-[var(--text-2)]">{row.count}</td>
                    <td class="text-right tabular-nums">{formatCurrencyCompact(row.revenue)}</td>
                    <td class="text-right tabular-nums text-[var(--text-2)]">{formatCurrencyCompact(row.cogs)}</td>
                    <td class="text-right font-semibold tabular-nums"
                        style="color:{row.profit >= 0 ? 'var(--teal-fg)' : 'var(--crimson-fg)'}">
                      {row.profit >= 0 ? '+' : ''}{formatCurrencyCompact(row.profit)}
                    </td>
                    <td class="text-right">
                      <span class="inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold tabular-nums {marginTone(row.margin)}"
                            style="background:{marginBg(row.margin)}">
                        {row.margin.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
      </div>

      <!-- Top products by profit -->
      <div class="surface-card p-4 md:p-5 space-y-3">
        <h3 class="text-[13px] font-semibold text-[var(--text)]">Top Products by Profit</h3>
        {#if pnl.topProducts.length === 0}
          <p class="text-xs text-[var(--text-3)] py-4 text-center">No product data.</p>
        {:else}
          <div class="overflow-x-auto">
            <table class="tbl w-full">
              <thead>
                <tr>
                  <th class="w-10 text-left">#</th>
                  <th class="text-left">Product</th>
                  <th class="text-right">Units</th>
                  <th class="text-right">Revenue</th>
                  <th class="text-right">COGS</th>
                  <th class="text-right">Profit</th>
                  <th class="text-right">Margin</th>
                </tr>
              </thead>
              <tbody>
                {#each pnl.topProducts as p, i}
                  <tr>
                    <td>
                      <span class="inline-flex items-center justify-center w-6 h-6 rounded-md text-[11px] font-bold font-mono"
                            style="background:{i < 3 ? 'var(--gold-dim)' : 'var(--surface2)'}; color:{i < 3 ? 'var(--gold-fg)' : 'var(--text-3)'}">
                        {i + 1}
                      </span>
                    </td>
                    <td class="font-medium">{p.name}</td>
                    <td class="text-right tabular-nums text-[var(--text-2)]">{p.units}</td>
                    <td class="text-right tabular-nums">{formatCurrencyCompact(p.revenue)}</td>
                    <td class="text-right tabular-nums text-[var(--text-2)]">{formatCurrencyCompact(p.cogs)}</td>
                    <td class="text-right font-semibold tabular-nums"
                        style="color:{p.profit >= 0 ? 'var(--teal-fg)' : 'var(--crimson-fg)'}">
                      {p.profit >= 0 ? '+' : ''}{formatCurrencyCompact(p.profit)}
                    </td>
                    <td class="text-right">
                      <span class="inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold tabular-nums {marginTone(p.margin)}"
                            style="background:{marginBg(p.margin)}">
                        {p.margin.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
      </div>
    </div>

  <!--
    ════════════════════════════════════════════════════════════════════
    §3  BILL-BY-BILL P&L
    ════════════════════════════════════════════════════════════════════
  -->
  {:else if tab === 'bills'}
    <div class="space-y-4 anim-stagger">
      <!-- Period selector -->
      <div class="-mx-5 md:mx-0 overflow-x-auto pb-1">
        <div class="flex gap-1.5 px-5 md:px-0 w-max">
          {#each presets as p}
            {@const active = pnl.period?.preset === p.value}
            <button
              class="btn btn-sm whitespace-nowrap transition-all {active ? 'btn-primary' : 'btn-secondary'}"
              onclick={() => setPeriod(p.value)}
            >
              {p.label}
            </button>
          {/each}
        </div>
      </div>

      <!-- Search -->
      <div class="surface-card p-3 flex items-center gap-2">
        <Search size={14} strokeWidth={2} class="text-[var(--text-3)] shrink-0" />
        <input
          type="text"
          placeholder="Search by sale ref or customer…"
          class="flex-1 bg-transparent text-[13px] text-[var(--text)] placeholder:text-[var(--text-3)] outline-none"
          bind:value={billSearch}
          oninput={() => { billPage = 0; }}
        />
        {#if billSearch}
          <button class="text-[10px] text-[var(--text-3)] hover:text-[var(--text)]"
                  onclick={() => { billSearch = ''; billPage = 0; }}>Clear</button>
        {/if}
      </div>

      <!-- Bills table -->
      <div class="surface-card p-4 md:p-5">
        {#if filteredBills().length === 0}
          <p class="text-xs text-[var(--text-3)] py-6 text-center">No bills found.</p>
        {:else}
          <div class="overflow-x-auto">
            <table class="tbl w-full">
              <thead>
                <tr>
                  <th class="text-left">Sale Ref</th>
                  <th class="text-left">
                    <button class="inline-flex items-center gap-1" onclick={() => toggleSort('date')}>
                      Date <ArrowUpDown size={10} />
                    </button>
                  </th>
                  <th class="text-left">Customer</th>
                  <th class="text-right">
                    <button class="inline-flex items-center gap-1" onclick={() => toggleSort('revenue')}>
                      Revenue <ArrowUpDown size={10} />
                    </button>
                  </th>
                  <th class="text-right">
                    <button class="inline-flex items-center gap-1" onclick={() => toggleSort('cogs')}>
                      COGS <ArrowUpDown size={10} />
                    </button>
                  </th>
                  <th class="text-right">
                    <button class="inline-flex items-center gap-1" onclick={() => toggleSort('profit')}>
                      Profit <ArrowUpDown size={10} />
                    </button>
                  </th>
                  <th class="text-right">
                    <button class="inline-flex items-center gap-1" onclick={() => toggleSort('margin')}>
                      Margin <ArrowUpDown size={10} />
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {#each pagedBills() as bill}
                  <tr>
                    <td>
                      <a href="/history/{bill.id}" class="font-mono text-[12px] text-[var(--text-2)] hover:text-[var(--primary)]">
                        {bill.ref}
                      </a>
                    </td>
                    <td class="whitespace-nowrap text-[12px]">{formatDateTime(bill.date)}</td>
                    <td class="text-[12px] text-[var(--text-2)]">{bill.customer ?? '—'}</td>
                    <td class="text-right tabular-nums">{formatCurrencyCompact(bill.revenue)}</td>
                    <td class="text-right tabular-nums text-[var(--text-2)]">{formatCurrencyCompact(bill.cogs)}</td>
                    <td class="text-right font-semibold tabular-nums"
                        style="color:{bill.profit >= 0 ? 'var(--teal-fg)' : 'var(--crimson-fg)'}">
                      {bill.profit >= 0 ? '+' : ''}{formatCurrencyCompact(bill.profit)}
                    </td>
                    <td class="text-right">
                      <span class="inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold tabular-nums {marginTone(bill.margin)}"
                            style="background:{marginBg(bill.margin)}">
                        {bill.margin.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                {/each}
              </tbody>
              <tfoot>
                <tr class="border-t-2 border-[var(--border)]">
                  <td colspan="3" class="font-semibold text-[12px]">Running Total ({filteredBills().length} bills)</td>
                  <td class="text-right font-bold tabular-nums">{formatCurrencyCompact(runningTotal().revenue)}</td>
                  <td class="text-right font-bold tabular-nums text-[var(--text-2)]">{formatCurrencyCompact(runningTotal().cogs)}</td>
                  <td class="text-right font-bold tabular-nums"
                      style="color:{runningTotal().profit >= 0 ? 'var(--teal-fg)' : 'var(--crimson-fg)'}">
                    {runningTotal().profit >= 0 ? '+' : ''}{formatCurrencyCompact(runningTotal().profit)}
                  </td>
                  {#if true}
                    {@const rt = runningTotal()}
                    {@const rtMargin = rt.revenue > 0 ? Math.round(((rt.profit / rt.revenue) * 100) * 10) / 10 : 0}
                    <td class="text-right">
                      <span class="inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold tabular-nums {marginTone(rtMargin)}"
                            style="background:{marginBg(rtMargin)}">
                        {rtMargin.toFixed(1)}%
                      </span>
                    </td>
                  {/if}
                </tr>
              </tfoot>
            </table>
          </div>

          <!-- Pagination -->
          {#if totalPages > 1}
            <div class="flex items-center justify-between mt-3 pt-3 border-t border-[var(--border)]">
              <span class="text-[11px] text-[var(--text-3)]">
                Page {billPage + 1} of {totalPages}
              </span>
              <div class="flex gap-1.5">
                <button class="btn btn-sm btn-secondary" disabled={billPage === 0}
                        onclick={() => { billPage = Math.max(0, billPage - 1); }}>
                  <ChevronLeft size={12} /> Prev
                </button>
                <button class="btn btn-sm btn-secondary" disabled={billPage >= totalPages - 1}
                        onclick={() => { billPage = Math.min(totalPages - 1, billPage + 1); }}>
                  Next <ChevronRight size={12} />
                </button>
              </div>
            </div>
          {/if}
        {/if}
      </div>
    </div>
  {/if}
</div>
