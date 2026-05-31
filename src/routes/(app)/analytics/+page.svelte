<script lang="ts">
  import { goto }           from '$app/navigation';
  import { page }           from '$app/stores';
  import { formatCurrency } from '$lib/utils/format';
  import PageShell from '$lib/components/layout/PageShell.svelte';
  import KpiCard   from '$lib/components/ui/KpiCard.svelte';

  let { data } = $props();

  const periods = [
    { value: '7d',  label: '7 days'  },
    { value: '30d', label: '30 days' },
    { value: '90d', label: '3 months'},
    { value: '1y',  label: '1 year'  },
  ];

  function setPeriod(p: string) {
    goto(`/analytics?period=${p}`, { replaceState: true });
  }

  // Simple bar chart using inline SVG
  const maxRevenue = $derived(Math.max(...(data.revenueByDay.map(d => d.revenue)), 1));

  const methodTotal = $derived(
    Object.values(data.byMethod as Record<string, number>).reduce((s, v) => s + v, 0) || 1
  );
</script>

<svelte:head><title>Analytics · Shëlf</title></svelte:head>

<PageShell>
  <!-- Period selector -->
  <div class="flex gap-2 mb-5 overflow-x-auto pb-1">
    {#each periods as p}
      <button
        class="btn btn-sm flex-shrink-0 {data.period === p.value ? 'btn-primary' : 'btn-secondary'}"
        onclick={() => setPeriod(p.value)}
      >{p.label}</button>
    {/each}
  </div>

  <!-- KPIs -->
  <div class="grid grid-cols-2 gap-3 mb-6">
    <KpiCard label="Revenue"      value={formatCurrency(data.totalRevenue)}     icon="Revenue"  iconColor="var(--teal)" />
    <KpiCard label="Transactions" value={String(data.transactionCount)}          icon="sale"     iconColor="var(--primary)" />
    <KpiCard label="Avg order"    value={formatCurrency(data.avgOrder)}          icon="Receipt"  iconColor="var(--cobalt)" />
    <KpiCard label="Tax collected" value={formatCurrency(data.totalTax)}         icon="Percent"  iconColor="var(--gold)" />
  </div>

  <!-- Revenue chart (pure SVG, no library needed) -->
  {#if data.revenueByDay.length > 0}
    <div class="card p-4 mb-5">
      <p class="text-xs font-semibold text-[var(--text-2)] mb-3">Revenue over time</p>
      <div class="overflow-x-auto">
        <svg
          viewBox="0 0 {Math.max(data.revenueByDay.length * 28, 300)} 100"
          preserveAspectRatio="none"
          class="w-full"
          style="height:100px"
        >
          <!-- Grid lines -->
          {#each [0.25, 0.5, 0.75, 1] as ratio}
            <line
              x1="0" y1={100 - ratio * 90}
              x2="9999" y2={100 - ratio * 90}
              stroke="var(--border)" stroke-width="0.5"
            />
          {/each}

          <!-- Bars -->
          {#each data.revenueByDay as day, i}
            {@const h = Math.max((day.revenue / maxRevenue) * 90, 2)}
            {@const x = i * 28 + 4}
            <rect
              {x} y={100 - h}
              width="20" height={h}
              rx="3"
              fill="var(--primary)"
              opacity="0.85"
            />
          {/each}
        </svg>
        <!-- X-axis labels: show every nth label -->
        {#if data.revenueByDay.length <= 14}
          <div class="flex justify-between mt-1">
            {#each data.revenueByDay as day}
              <span class="text-[9px] text-[var(--text-3)]">{day.date.slice(5)}</span>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  {/if}

  <!-- Payment methods -->
  <div class="card p-4 mb-5">
    <p class="text-xs font-semibold text-[var(--text-2)] mb-3">Payment methods</p>
    <div class="flex flex-col gap-2">
      {#each Object.entries(data.byMethod as Record<string, number>) as [method, amount]}
        {@const pct = Math.round(amount / methodTotal * 100)}
        <div class="flex items-center gap-3">
          <span class="text-xs capitalize text-[var(--text-2)] w-16">{method}</span>
          <div class="flex-1 bg-[var(--surface2)] rounded-full h-2">
            <div class="h-2 rounded-full bg-[var(--primary)] transition-all" style="width:{pct}%"></div>
          </div>
          <span class="text-xs font-semibold w-20 text-right">{formatCurrency(amount)}</span>
          <span class="text-[10px] text-[var(--text-3)] w-8 text-right">{pct}%</span>
        </div>
      {/each}
    </div>
  </div>

  <!-- Top products -->
  {#if data.topProducts.length > 0}
    <div class="card p-4 mb-5">
      <p class="text-xs font-semibold text-[var(--text-2)] mb-3">Top products</p>
      <div class="flex flex-col gap-2">
        {#each data.topProducts as p, i}
          <div class="flex items-center gap-3">
            <span class="text-[10px] font-semibold text-[var(--text-3)] w-4">{i + 1}</span>
            <span class="text-xs flex-1 truncate">{(p as any).name}</span>
            <span class="text-[10px] text-[var(--text-3)]">{(p as any).qty} sold</span>
            <span class="text-xs font-semibold">{formatCurrency((p as any).revenue)}</span>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Categories -->
  {#if data.byCategory.length > 0}
    <div class="card p-4">
      <p class="text-xs font-semibold text-[var(--text-2)] mb-3">Revenue by category</p>
      <div class="flex flex-col gap-2">
        {#each data.byCategory as cat}
          {@const pct = Math.round((cat as any).revenue / data.totalRevenue * 100)}
          <div class="flex items-center gap-3">
            <div class="w-2.5 h-2.5 rounded-full flex-shrink-0" style="background:{(cat as any).color}"></div>
            <span class="text-xs flex-1 truncate">{(cat as any).name}</span>
            <div class="w-24 bg-[var(--surface2)] rounded-full h-1.5">
              <div class="h-1.5 rounded-full transition-all" style="width:{pct}%;background:{(cat as any).color}"></div>
            </div>
            <span class="text-xs font-semibold w-20 text-right">{formatCurrency((cat as any).revenue)}</span>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</PageShell>
