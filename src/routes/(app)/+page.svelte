<script lang="ts">
  import { currentShop } from '$lib/stores/shop.svelte';
  import { auth }        from '$lib/stores/auth.svelte';
  import { formatCurrency, formatTime } from '$lib/utils/format';
  import PageShell  from '$lib/components/layout/PageShell.svelte';
  import KpiCard    from '$lib/components/ui/KpiCard.svelte';
  import Button     from '$lib/components/ui/Button.svelte';
  import EmptyState from '$lib/components/ui/EmptyState.svelte';
  import { ShoppingCart, Package, Users, BarChart2, AlertTriangle } from 'lucide-svelte';

  let { data } = $props();

  const greeting = $derived(() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  });
</script>

<svelte:head><title>Dashboard · Shëlf</title></svelte:head>

<PageShell>
  <!-- Hero greeting -->
  <div class="mb-6">
    <h2 class="text-lg font-semibold">{greeting()}, {auth.user?.name?.split(' ')[0] ?? 'there'} 👋</h2>
    <p class="text-xs text-[var(--text-3)]">{currentShop.data?.name ?? 'Your shop'} · Today's overview</p>
  </div>

  <!-- KPIs -->
  <div class="grid grid-cols-2 gap-3 mb-6">
    <KpiCard label="Today's Revenue" value={formatCurrency(data.todayRevenue)}
             icon="Revenue" iconColor="var(--teal)" />
    <KpiCard label="Transactions" value={String(data.todayCount)}
             icon="sale" iconColor="var(--primary)" />
  </div>

  <!-- Quick actions -->
  <div class="grid grid-cols-2 gap-3 mb-6">
    <Button href="/sale"      class="justify-center h-14 text-xs font-semibold gap-2">
      <ShoppingCart size={16} strokeWidth={1.75} /> New Sale
    </Button>
    <Button href="/inventory" variant="secondary" class="justify-center h-14 text-xs font-semibold gap-2">
      <Package size={16} strokeWidth={1.75} /> Inventory
    </Button>
    <Button href="/customers" variant="secondary" class="justify-center h-14 text-xs font-semibold gap-2">
      <Users size={16} strokeWidth={1.75} /> Customers
    </Button>
    <Button href="/analytics" variant="secondary" class="justify-center h-14 text-xs font-semibold gap-2">
      <BarChart2 size={16} strokeWidth={1.75} /> Analytics
    </Button>
  </div>

  <!-- Low stock alert -->
  {#if data.lowStock.length > 0}
    <div class="card p-4 mb-5 border-[var(--gold-dim)]" style="border-color:var(--gold)">
      <div class="flex items-center gap-2 mb-3">
        <AlertTriangle size={15} style="color:var(--gold)" strokeWidth={1.75} />
        <p class="text-xs font-semibold text-[var(--gold-fg)]">{data.lowStock.length} item{data.lowStock.length > 1 ? 's' : ''} need restocking</p>
      </div>
      <div class="flex flex-col gap-1.5">
        {#each data.lowStock.slice(0,5) as p}
          <div class="flex items-center justify-between">
            <span class="text-xs truncate">{(p as any).name}</span>
            <span class="badge {(p as any).qty === 0 ? 'badge-crimson' : 'badge-gold'} ml-2">
              {(p as any).qty === 0 ? 'Out' : `${(p as any).qty} left`}
            </span>
          </div>
        {/each}
      </div>
      <a href="/inventory?filter=alerts" class="text-xs text-[var(--primary)] hover:underline mt-2 inline-block">
        View all stock alerts →
      </a>
    </div>
  {/if}

  <!-- Recent sales -->
  <div>
    <div class="page-header mb-3">
      <p class="section-lbl">Recent sales</p>
      <a href="/history" class="text-xs text-[var(--primary)] hover:underline">See all</a>
    </div>
    {#if data.todaySales.length === 0}
      <EmptyState icon="ShoppingCart" title="No sales yet today" message="Make your first sale to see it here." />
    {:else}
      <div class="card overflow-hidden">
        {#each data.todaySales as sale}
          <a href="/history/{(sale as any).id}"
             class="flex items-center gap-3 px-4 py-3 border-b last:border-0 border-[var(--border)] hover:bg-[var(--surface2)] transition-colors">
            <div class="w-8 h-8 rounded-full bg-[var(--primary-dim)] flex items-center justify-center flex-shrink-0">
              <ShoppingCart size={13} style="color:var(--primary)" strokeWidth={1.75} />
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-xs font-semibold truncate">{(sale as any).customer?.name ?? 'Walk-in'}</p>
              <p class="text-[10px] text-[var(--text-3)]">{formatTime((sale as any).date_created)}</p>
            </div>
            <p class="text-sm font-semibold">{formatCurrency((sale as any).total)}</p>
          </a>
        {/each}
      </div>
    {/if}
  </div>
</PageShell>
