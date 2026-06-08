<script lang="ts">
  import PageShell from '$lib/components/layout/PageShell.svelte';
  import { formatCurrency } from '$lib/utils/format';
  import Button from '$lib/components/ui/Button.svelte';
  import {
    LayoutGrid,
    PackagePlus,
    Users,
    BarChart3,
    ShoppingBag,
    Package,
    AlertTriangle,
    Receipt,
  } from 'lucide-svelte';

  let { data } = $props();

  function formatTime(dateStr: string) {
    return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  const paymentLabel: Record<string, string> = {
    cash:     'Cash',
    card:     'Card',
    transfer: 'Transfer',
  };

  const avgSale     = $derived(data.todayCount > 0 ? Math.round(data.todayRevenue / data.todayCount) : 0);
  const totalAlerts = $derived(data.outOfStock.length + data.lowStock.length);
</script>

<PageShell>
  <div class="page-header">
    <div class="flex-1">
      <p class="text-base font-semibold">Store Dashboard</p>
      <p class="text-xs text-[var(--text-3)]">Welcome back — here's how today is going</p>
    </div>
  </div>

  <div class="space-y-6">

    <!-- ── Metrics row ──────────────────────────────────────────────────────── -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">

      <div class="card p-4">
        <p class="text-[10px] text-[var(--text-3)] uppercase font-bold tracking-wide mb-1">Today's Revenue</p>
        <p class="text-xl font-bold tabular-nums">{formatCurrency(data.todayRevenue)}</p>
        {#if data.todayCount > 0}
          <p class="text-[11px] text-[var(--text-3)] mt-1">avg {formatCurrency(avgSale)} / sale</p>
        {:else}
          <p class="text-[11px] text-[var(--text-3)] mt-1">No sales yet</p>
        {/if}
      </div>

      <div class="card p-4">
        <p class="text-[10px] text-[var(--text-3)] uppercase font-bold tracking-wide mb-1">Today's Profit</p>
        <p
          class="text-xl font-bold tabular-nums"
          class:text-crimson={data.todayProfit < 0}
        >
          {formatCurrency(data.todayProfit)}
        </p>
        {#if data.todayRevenue > 0}
          <p class="text-[11px] text-[var(--text-3)] mt-1">{data.profitMargin}% margin</p>
        {:else}
          <p class="text-[11px] text-[var(--text-3)] mt-1">No sales yet</p>
        {/if}
      </div>

      <div class="card p-4">
        <p class="text-[10px] text-[var(--text-3)] uppercase font-bold tracking-wide mb-1">Transactions</p>
        <p class="text-xl font-bold tabular-nums">{data.todayCount}</p>
        {#if Object.keys(data.paymentBreakdown).length > 0}
          <div class="flex gap-2 mt-1 flex-wrap">
            {#each Object.entries(data.paymentBreakdown) as [method, count]}
              <span class="text-[11px] text-[var(--text-3)]">
                {paymentLabel[method] ?? method}: {count}
              </span>
            {/each}
          </div>
        {:else}
          <p class="text-[11px] text-[var(--text-3)] mt-1">No sales yet</p>
        {/if}
      </div>

      <div class="card p-4">
        <p class="text-[10px] text-[var(--text-3)] uppercase font-bold tracking-wide mb-1">Inventory Alerts</p>
        <p
          class="text-xl font-bold tabular-nums"
          class:text-crimson={totalAlerts > 0}
        >
          {totalAlerts}
        </p>
        {#if totalAlerts > 0}
          <div class="flex gap-2 mt-1 flex-wrap">
            {#if data.outOfStock.length > 0}
              <span class="text-[11px] text-crimson">{data.outOfStock.length} out of stock</span>
            {/if}
            {#if data.lowStock.length > 0}
              <span class="text-[11px] text-amber-500">{data.lowStock.length} low</span>
            {/if}
          </div>
        {:else}
          <p class="text-[11px] text-[var(--text-3)] mt-1">All stocked up ✓</p>
        {/if}
      </div>

    </div>

    <!-- ── Main grid ─────────────────────────────────────────────────────────── -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">

      <!-- Quick Actions -->
      <div class="card p-4 space-y-3">
        <div class="flex items-center gap-2">
          <LayoutGrid size={16} class="text-primary" />
          <h3 class="font-semibold text-sm">Quick Actions</h3>
        </div>
        <div class="flex flex-col gap-2">
          <Button onclick={() => window.location.href = '/sale'} class="justify-start gap-2">
            <ShoppingBag size={14} /> New Sale
          </Button>
          <Button onclick={() => window.location.href = '/inventory'} variant="secondary" class="justify-start gap-2">
            <Package size={14} /> Manage Inventory
          </Button>
          <Button onclick={() => window.location.href = '/restocking/orders/new'} variant="secondary" class="justify-start gap-2">
            <PackagePlus size={14} /> Restock Stock
          </Button>
          <Button onclick={() => window.location.href = '/restocking/suppliers'} variant="secondary" class="justify-start gap-2">
            <Users size={14} /> Manage Suppliers
          </Button>
          <Button onclick={() => window.location.href = '/analytics'} variant="secondary" class="justify-start gap-2">
            <BarChart3 size={14} /> Business Analytics
          </Button>
        </div>
      </div>

      <!-- Today's Sales -->
      <div class="card p-4 md:col-span-2 space-y-3">
        <div class="flex items-center gap-2">
          <Receipt size={16} class="text-primary" />
          <h3 class="font-semibold text-sm">Today's Sales</h3>
        </div>

        {#if data.todaySales.length === 0}
          <p class="text-sm text-[var(--text-3)] py-6 text-center">No sales recorded yet today.</p>
        {:else}
          <div>
            {#each data.todaySales as sale}
              <div class="flex items-center justify-between py-2.5 border-b border-[var(--border)] last:border-0">
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium truncate">{sale.customer?.name ?? 'Walk-in'}</p>
                  <p class="text-xs text-[var(--text-3)]">{formatTime(sale.date_created)}</p>
                </div>
                <div class="flex items-center gap-3 ml-3 shrink-0">
                  <span class="text-xs px-2 py-0.5 rounded-full bg-surface-2 text-[var(--text-3)]">
                    {paymentLabel[sale.payment_method] ?? sale.payment_method}
                  </span>
                  <p class="text-sm font-semibold tabular-nums">{formatCurrency(sale.total)}</p>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </div>

    <!-- ── Inventory Alerts ───────────────────────────────────────────────────── -->
    {#if totalAlerts > 0}
      <div class="card p-4 space-y-4">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <AlertTriangle size={16} class="text-crimson" />
            <h3 class="font-semibold text-sm">Inventory Alerts</h3>
            <span class="text-[10px] px-1.5 py-0.5 rounded-full bg-crimson/10 text-crimson font-bold leading-none">
              {totalAlerts}
            </span>
          </div>
          <Button
            onclick={() => window.location.href = '/restocking/orders/new'}
            variant="secondary"
            class="gap-1.5 text-xs h-7"
          >
            <PackagePlus size={12} /> Create Restock Order
          </Button>
        </div>

        <!-- Out of stock: critical -->
        {#if data.outOfStock.length > 0}
          <div>
            <p class="text-[10px] uppercase font-bold text-crimson tracking-wide mb-2">
              Out of Stock — {data.outOfStock.length} {data.outOfStock.length === 1 ? 'item' : 'items'}
            </p>
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {#each data.outOfStock as product}
                <div class="p-3 rounded-lg border border-crimson/20 bg-crimson/5">
                  <p class="text-xs font-medium truncate mb-1">{product.name}</p>
                  <p class="text-xl font-bold text-crimson tabular-nums">0</p>
                  <p class="text-[10px] text-crimson/70 mt-0.5">Out of stock</p>
                </div>
              {/each}
            </div>
          </div>
        {/if}

        <!-- Low stock: warning -->
        {#if data.lowStock.length > 0}
          <div>
            <p class="text-[10px] uppercase font-bold text-amber-500 tracking-wide mb-2">
              Low Stock — {data.lowStock.length} {data.lowStock.length === 1 ? 'item' : 'items'}
            </p>
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {#each data.lowStock as product}
                <div class="p-3 rounded-lg bg-surface-2">
                  <p class="text-xs font-medium truncate mb-1">{product.name}</p>
                  <p class="text-xl font-bold text-amber-500 tabular-nums">{product.qty}</p>
                  <p class="text-[10px] text-[var(--text-3)] mt-0.5">Low stock</p>
                </div>
              {/each}
            </div>
          </div>
        {/if}

      </div>
    {/if}

  </div>
</PageShell>
