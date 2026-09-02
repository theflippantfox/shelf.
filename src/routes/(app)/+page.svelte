<script lang="ts">
  import KpiCard from '$lib/components/ui/KpiCard.svelte';
  import StatTile from '$lib/components/ui/StatTile.svelte';
  import EmptyState from '$lib/components/ui/EmptyState.svelte';
  import DynamicIcon from '$lib/components/ui/DynamicIcon.svelte';
  import { formatCurrency, formatCurrencyCompact } from '$lib/utils/format';
  import {
    Wallet, TrendingUp, ShoppingBag, AlertTriangle, Package,
    ShoppingCart, Users, BarChart3, ArrowRight,
    Banknote, CreditCard, ArrowLeftRight,
  } from 'lucide-svelte';

  let { data } = $props();

  function formatTime(dateStr: string) {
    return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function formatDate(d: Date) {
    return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  }

  const paymentMeta: Record<string, { label: string; icon: any; color: string }> = {
    cash:     { label: 'Cash',     icon: Banknote,    color: 'var(--teal)'    },
    card:     { label: 'Card',     icon: CreditCard,  color: 'var(--cobalt)'  },
    transfer: { label: 'Transfer', icon: ArrowLeftRight, color: 'var(--primary)' },
  };

  const avgSale = $derived(data.todayCount > 0 ? Math.round(data.todayRevenue / data.todayCount) : 0);
  const totalAlerts = $derived(data.outOfStock.length + data.lowStock.length);
  const hasSales = $derived(data.todayCount > 0);

  // Stock bar for each alert product
  function stockPct(qty: number, threshold: number) {
    const cap = Math.max(threshold * 2, 10);
    return Math.min(100, Math.round((qty / cap) * 100));
  }

  // Quick action tiles — mobile-first nav.
  // Desktop users have the sidebar; bottom-nav (mobile) is fixed to 5 items,
  // so this card surfaces the rest: Inventory, Restock, Analytics, Suppliers.
  // "New Sale" is intentionally NOT here — it's already in the bottom-nav FAB
  // and the sidebar's "Point of Sale" entry.
  const actions = [
    { href: '/inventory',               label: 'Inventory',         icon: 'Package',     tone: 'cobalt'  },
    { href: '/restocking/orders/new',   label: 'Restock',           icon: 'Plus',        tone: 'teal'    },
    { href: '/analytics',               label: 'Analytics',         icon: 'BarChart3',   tone: 'violet'  },
    { href: '/restocking/suppliers',    label: 'Suppliers',         icon: 'Truck',       tone: 'gold'    },
  ] as const;
</script>

<div class="fade-up">
  <!-- Header -->
  <h1 class="text-[22px] md:text-[26px] font-semibold text-[var(--text)] tracking-tight mb-5">
    {data.greeting}{data.firstName ? `, ${data.firstName}` : ''}
  </h1>

  <!-- ── Stats area: 4 primary KPIs + 3 secondary stats, all in one block ── -->
  <div class="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3 mb-2 md:mb-3 anim-stagger">
    <KpiCard
      label="Today's Revenue"
      value={formatCurrencyCompact(data.todayRevenue)}
      icon="TrendingUp"
      iconColor="var(--primary)"
      sub={hasSales ? `avg ${formatCurrencyCompact(avgSale)} / sale` : 'No sales yet'}
      trend={data.revenueDelta.pct === 0 ? undefined : {
        direction: data.revenueDelta.direction,
        label: `${data.revenueDelta.pct}% vs yest`,
      }}
    />
    <KpiCard
      label="Today's Profit"
      value={formatCurrencyCompact(data.todayProfit)}
      icon="Wallet"
      iconColor={data.todayProfit < 0 ? 'var(--crimson)' : 'var(--teal)'}
      sub={hasSales ? `${data.profitMargin}% margin` : 'No sales yet'}
      trend={data.profitDelta.pct === 0 ? undefined : {
        direction: data.profitDelta.direction,
        label: `${data.profitDelta.pct}% vs yest`,
      }}
    />
    <KpiCard
      label="Transactions"
      value={String(data.todayCount)}
      icon="ShoppingBag"
      iconColor="var(--cobalt)"
      sub={hasSales
        ? `${Object.entries(data.paymentBreakdown).map(([m, c]) => `${paymentMeta[m]?.label ?? m} ${c}`).join(' · ')}`
        : 'No sales yet'}
      trend={data.txnsDelta.pct === 0 ? undefined : {
        direction: data.txnsDelta.direction,
        label: `${data.txnsDelta.pct}% vs yest`,
      }}
    />
    <KpiCard
      label="Inventory Alerts"
      value={String(totalAlerts)}
      icon="AlertTriangle"
      iconColor={totalAlerts > 0 ? 'var(--crimson)' : 'var(--teal)'}
      sub={totalAlerts > 0
        ? `${data.outOfStock.length} out · ${data.lowStock.length} low`
        : 'All stocked up'}
    />
  </div>

  <div class="grid grid-cols-3 gap-2 md:gap-3 mb-6 anim-stagger" style="animation-delay: 200ms">
    <StatTile
      label="Avg basket"
      value={String(data.avgBasket || '—')}
      sub="items per sale"
      icon={ShoppingCart}
      tone="cobalt"
    />
    <StatTile
      label="Customers"
      value={String(data.distinctCustomers)}
      sub="distinct today"
      icon={Users}
      tone="primary"
    />
    <StatTile
      label="Stock value"
      value={formatCurrencyCompact(data.stockValueRetail)}
      sub={`cost ${formatCurrencyCompact(data.stockValueCost)}`}
      icon={Package}
      tone="teal"
    />
  </div>

  <!-- Quick actions card: mobile nav. Hidden on desktop (md:hidden) so it
       contributes 0 width to the layout. Sits as its own surface between
       the stats area and Today's Sales. -->
  <div class="surface-card p-4 md:p-5 mb-3 md:hidden">
    <div class="flex items-center justify-between mb-4">
      <div class="flex items-center gap-2">
        <span class="w-1.5 h-1.5 rounded-full" style="background:var(--primary)"></span>
        <h3 class="font-semibold text-[13.5px] text-[var(--text)] tracking-tight">Quick actions</h3>
      </div>
    </div>

    <div class="grid grid-cols-2 gap-2">
      {#each actions as a}
        <a
          href={a.href}
          class="surface-card interactive p-3.5 no-glow group"
          data-sveltekit-preload-data="hover"
        >
          <div class="w-9 h-9 rounded-lg flex items-center justify-center mb-2.5 transition-transform group-hover:scale-110 icon-tint-{a.tone}">
            <DynamicIcon name={a.icon} size={16} />
          </div>
          <p class="text-[12.5px] font-semibold leading-tight text-[var(--text)]">{a.label}</p>
        </a>
      {/each}
    </div>
  </div>

  <!-- Today's Sales: full-width on desktop (where Quick Actions is hidden),
       and stacked above the rest. On mobile, the Quick Actions card sits
       directly above this card as a separate surface. -->
  <div class="mb-6">
    <div class="surface-card p-4 md:p-5">
      <div class="flex items-center justify-between mb-3">
        <div class="flex items-center gap-2">
          <ShoppingBag size={15} style="color:var(--primary)" />
          <h3 class="font-semibold text-sm">Today's Sales</h3>
          {#if hasSales}
            <span class="badge badge-neutral text-[10px]">{data.todayCount}</span>
          {/if}
        </div>
        <a
          href="/history"
          class="text-[11px] font-semibold text-[var(--text-3)] hover:text-[var(--text)] inline-flex items-center gap-0.5"
        >
          View history <ArrowRight size={11} strokeWidth={2} />
        </a>
      </div>

      {#if !hasSales}
        <EmptyState
          icon="ShoppingBag"
          title="No sales yet today"
          message="Once you ring up a sale it'll show up here in real time."
        />
      {:else}
        <div class="divide-y divide-[var(--border)]">
          {#each data.todaySales as sale}
            {@const meta = paymentMeta[sale.payment_method]}
            <div class="flex items-center justify-between py-2.5 first:pt-0 last:pb-0">
              <div class="flex items-center gap-2.5 min-w-0 flex-1">
                <div class="w-7 h-7 rounded-lg flex-shrink-0 flex items-center justify-center"
                     style="background:color-mix(in srgb, {meta?.color ?? 'var(--text-3)'} 14%, transparent)">
                  {#if meta}
                    <meta.icon size={13} strokeWidth={2} style="color:{meta.color}" />
                  {:else}
                    <Banknote size={13} strokeWidth={2} class="text-[var(--text-3)]" />
                  {/if}
                </div>
                <div class="min-w-0">
                  <p class="text-[13px] font-semibold truncate">{sale.customer?.name ?? 'Walk-in customer'}</p>
                  <p class="text-[11px] text-[var(--text-3)]">{meta?.label ?? sale.payment_method} · {formatTime(sale.created_at)}</p>
                </div>
              </div>
              <p class="text-[13px] font-semibold tabular-nums ml-3 shrink-0">{formatCurrency(sale.total)}</p>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </div>

  <!-- ── Bottom: stats (left) + stock alerts (right) ───────────────────────── -->
  <div class="grid grid-cols-1 md:grid-cols-3 gap-4">

    <!-- Left: extra stats stack -->
    <div class="md:col-span-2 space-y-4">

      <!-- Top movers + categories row -->
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">

        <!-- Top selling products today -->
        <div class="surface-card p-4 md:p-5">
          <div class="flex items-center justify-between mb-4">
            <div class="flex items-center gap-2">
              <TrendingUp size={15} style="color:var(--primary)" />
              <h3 class="font-semibold text-[13.5px] text-[var(--text)] tracking-tight">Top sellers today</h3>
            </div>
            {#if data.topProducts.length > 0}
              <span class="badge badge-neutral text-[10px]">{data.topProducts.length}</span>
            {/if}
          </div>

          {#if data.topProducts.length === 0}
            <div class="text-center py-6">
              <div class="w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-2"
                   style="background:color-mix(in srgb, var(--text-3) 10%, transparent)">
                <Package size={18} strokeWidth={1.75} class="text-[var(--text-3)]" />
              </div>
              <p class="text-[12.5px] font-semibold text-[var(--text-2)]">No products sold yet</p>
            </div>
          {:else}
            <div class="space-y-2.5">
              {#each data.topProducts as p, i}
                {@const maxQty = data.topProducts[0].qty || 1}
                <div>
                  <div class="flex items-center justify-between gap-2 mb-1">
                    <div class="flex items-center gap-2 min-w-0 flex-1">
                      <span class="text-[10px] font-mono font-bold text-[var(--text-3)] w-4 shrink-0 tabular">#{i + 1}</span>
                      <p class="text-[12.5px] font-semibold text-[var(--text)] truncate">{p.name}</p>
                    </div>
                    <p class="text-[12px] font-semibold tabular-nums whitespace-nowrap text-[var(--text-2)]">
                      {p.qty} <span class="text-[var(--text-3)] font-normal">sold</span>
                    </p>
                  </div>
                  <div class="h-1 rounded-full overflow-hidden" style="background:var(--surface2); margin-left:24px">
                    <div class="h-full rounded-full transition-all duration-700"
                         style="width:{(p.qty / maxQty) * 100}%; background:var(--primary)"></div>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>

        <!-- Top categories today -->
        <div class="surface-card p-4 md:p-5">
          <div class="flex items-center justify-between mb-4">
            <div class="flex items-center gap-2">
              <BarChart3 size={15} style="color:var(--primary)" />
              <h3 class="font-semibold text-[13.5px] text-[var(--text)] tracking-tight">By category</h3>
            </div>
          </div>

          {#if data.topCategories.length === 0}
            <div class="text-center py-6">
              <div class="w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-2"
                   style="background:color-mix(in srgb, var(--text-3) 10%, transparent)">
                <BarChart3 size={18} strokeWidth={1.75} class="text-[var(--text-3)]" />
              </div>
              <p class="text-[12.5px] font-semibold text-[var(--text-2)]">No category sales yet</p>
            </div>
          {:else}
            <div class="space-y-2.5">
              {#each data.topCategories as c}
                {@const totalCatRev = data.topCategories.reduce((s: number, x: any) => s + x.revenue, 0)}
                {@const pct = totalCatRev > 0 ? Math.round((c.revenue / totalCatRev) * 100) : 0}
                <div class="flex items-center gap-2.5">
                  <div class="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                       style="background:color-mix(in srgb, {c.color} 15%, transparent)">
                    <DynamicIcon name={c.icon} size={13} style="color:{c.color}" />
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="flex items-baseline justify-between gap-2">
                      <p class="text-[12.5px] font-semibold text-[var(--text)] truncate">{c.name}</p>
                      <p class="text-[11px] font-semibold tabular-nums whitespace-nowrap text-[var(--text-2)]">{pct}%</p>
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      </div>

      <!-- Quick stat tiles (basket, customers, stock value) moved into the unified stats area at the top of the page -->
    </div>

    <!-- Right: combined stock alerts -->
    <div class="surface-card p-4 md:p-5 md:col-span-1">
      <div class="flex items-center justify-between mb-4">
        <div class="flex items-center gap-2">
          <AlertTriangle size={15} style="color:var(--crimson)" />
          <h3 class="font-semibold text-[13.5px] text-[var(--text)] tracking-tight">Stock alerts</h3>
          {#if totalAlerts > 0}
            <span class="badge badge-crimson text-[10px]">{totalAlerts}</span>
          {/if}
        </div>
        {#if totalAlerts > 0}
          <a
            href="/restocking/orders/new"
            class="text-[11px] font-semibold text-[var(--primary)] hover:underline inline-flex items-center gap-0.5 transition-colors"
          >
            Restock <ArrowRight size={11} strokeWidth={2} />
          </a>
        {/if}
      </div>

      {#if totalAlerts === 0}
        <div class="flex flex-col items-center text-center py-6">
          <div class="w-10 h-10 rounded-full flex items-center justify-center mb-2"
               style="background:color-mix(in srgb, var(--teal) 14%, transparent)">
            <Package size={20} strokeWidth={2} style="color:var(--teal)" />
          </div>
          <p class="text-[13px] font-semibold text-[var(--text)]">All stocked up</p>
        </div>
      {:else}
        <!-- Out-of-stock section -->
        {#if data.outOfStock.length > 0}
          <div class="mb-4">
            <div class="flex items-center gap-1.5 mb-2">
              <span class="w-1.5 h-1.5 rounded-full" style="background:var(--crimson)"></span>
              <p class="text-[10px] font-bold uppercase tracking-wide" style="color:var(--crimson-fg)">
                Out of stock
              </p>
              <span class="text-[10px] text-[var(--text-3)]">· {data.outOfStock.length}</span>
            </div>
            <div class="space-y-1">
              {#each data.outOfStock.slice(0, 4) as product}
                <div class="flex items-center justify-between gap-2 py-1 px-2 rounded-md"
                     style="background:color-mix(in srgb, var(--crimson) 6%, transparent)">
                  <p class="text-[12.5px] font-medium text-[var(--text)] truncate min-w-0 flex-1">{product.name}</p>
                  <span class="text-[10px] font-bold tabular-nums whitespace-nowrap" style="color:var(--crimson-fg)">0</span>
                </div>
              {/each}
              {#if data.outOfStock.length > 4}
                <p class="text-[10px] text-[var(--text-3)] text-center pt-0.5">+{data.outOfStock.length - 4} more</p>
              {/if}
            </div>
          </div>
        {/if}

        <!-- Low-stock section -->
        {#if data.lowStock.length > 0}
          <div>
            <div class="flex items-center gap-1.5 mb-2">
              <span class="w-1.5 h-1.5 rounded-full" style="background:var(--gold)"></span>
              <p class="text-[10px] font-bold uppercase tracking-wide" style="color:var(--gold-fg)">
                Low stock
              </p>
              <span class="text-[10px] text-[var(--text-3)]">· {data.lowStock.length}</span>
            </div>
            <div class="space-y-1.5">
              {#each data.lowStock.slice(0, 4) as product}
                {@const threshold = product.low_stock_threshold ?? 10}
                {@const pct = stockPct(product.qty, threshold)}
                <div class="py-1 px-2 rounded-md"
                     style="background:color-mix(in srgb, var(--gold) 6%, transparent)">
                  <div class="flex items-center justify-between gap-2">
                    <p class="text-[12.5px] font-medium text-[var(--text)] truncate min-w-0 flex-1">{product.name}</p>
                    <p class="text-[11px] tabular-nums whitespace-nowrap">
                      <span style="color:var(--gold-fg); font-weight:600">{product.qty}</span>
                      <span class="text-[var(--text-3)]"> / {threshold}</span>
                    </p>
                  </div>
                  <div class="h-1 rounded-full mt-1 overflow-hidden" style="background:var(--gold-dim)">
                    <div class="h-full rounded-full transition-all duration-700"
                         style="width:{pct}%; background:var(--gold)"></div>
                  </div>
                </div>
              {/each}
              {#if data.lowStock.length > 4}
                <p class="text-[10px] text-[var(--text-3)] text-center pt-0.5">+{data.lowStock.length - 4} more</p>
              {/if}
            </div>
          </div>
        {/if}
      {/if}
    </div>
  </div>
</div>