<script lang="ts">
  import { goto } from '$app/navigation';
  import { formatCurrency, formatCurrencyCompact, formatDate, formatRelative } from '$lib/utils/format';
  import SearchBar from '$lib/components/ui/SearchBar.svelte';
  import Select    from '$lib/components/ui/Select.svelte';
  import EmptyState from '$lib/components/ui/EmptyState.svelte';
  import {
    PackagePlus, ChevronLeft, ChevronRight, X,
    Truck, CheckCircle2, Clock, AlertCircle, Ban, FileEdit,
  } from 'lucide-svelte';
  import { auth } from '$lib/stores/auth.svelte';

  let { data } = $props();

  type StatusKey = 'all' | 'draft' | 'ordered' | 'partial' | 'received' | 'cancelled';

  const STATUS_META: Record<Exclude<StatusKey, 'all'>, { icon: any; label: string; tone: string; bg: string; color: string }> = {
    draft:     { icon: FileEdit,    label: 'Draft',     tone: 'neutral', bg: 'var(--surface2)',    color: 'var(--text-2)'   },
    ordered:   { icon: Truck,       label: 'Ordered',   tone: 'primary', bg: 'var(--primary)/14',  color: 'var(--primary)'  },
    partial:   { icon: AlertCircle, label: 'Partial',   tone: 'amber',   bg: 'var(--amber)/14',    color: 'var(--amber)'    },
    received:  { icon: CheckCircle2, label: 'Received', tone: 'teal',    bg: 'var(--teal)/14',     color: 'var(--teal)'     },
    cancelled: { icon: Ban,         label: 'Cancelled', tone: 'crimson', bg: 'var(--crimson)/14',  color: 'var(--crimson)'  },
  };

  // Local search state
  let q = $state('');
  $effect(() => { q = (data as any).filters.q; });
  let searchTimer: ReturnType<typeof setTimeout> | null = null;
  function onSearchInput(v: string) {
    q = v;
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => applyFilters({ q: v, page: 1 }), 350);
  }

  // URL-driven filter helpers
  function buildUrl(overrides: Record<string, string | number | null | undefined>): string {
    const params = new URLSearchParams();
    const base = {
      q:        (data as any).filters.q,
      status:   (data as any).filters.status,
      supplier: (data as any).filters.supplier,
      page:     String((data as any).page),
    };
    const merged = { ...base, ...overrides };
    for (const [k, v] of Object.entries(merged)) {
      if (v === null || v === undefined) continue;
      const s = String(v);
      if ((k === 'q'        && s === '')    ||
          (k === 'status'   && s === 'all') ||
          (k === 'supplier' && s === '')    ||
          (k === 'page'     && s === '1')) continue;
      params.set(k, s);
    }
    const qs = params.toString();
    return qs ? `/restocking/orders?${qs}` : '/restocking/orders';
  }

  function applyFilters(overrides: Record<string, string | number | null | undefined>) {
    goto(buildUrl(overrides), { replaceState: true, keepFocus: true, noScroll: true });
  }

  function clearAll() {
    if (searchTimer) clearTimeout(searchTimer);
    goto('/restocking/orders', { replaceState: true, keepFocus: true, noScroll: true });
  }

  const hasFilters = $derived(
    (data as any).filters.q !== '' ||
    (data as any).filters.status !== 'all' ||
    (data as any).filters.supplier !== ''
  );

  // Pagination
  function prevPage() {
    if ((data as any).page <= 1) return;
    applyFilters({ page: (data as any).page - 1 });
  }
  function nextPage() {
    if ((data as any).orders.length < (data as any).limit) return;
    applyFilters({ page: (data as any).page + 1 });
  }

  // Status chips
  const statusChips: { key: StatusKey; label: string }[] = [
    { key: 'all',       label: 'All' },
    { key: 'draft',     label: 'Draft' },
    { key: 'ordered',   label: 'Ordered' },
    { key: 'partial',   label: 'Partial' },
    { key: 'received',  label: 'Received' },
    { key: 'cancelled', label: 'Cancelled' },
  ];

  const chipCount = (key: StatusKey): number => (data as any).counts[key] ?? 0;

  const chipActiveCls = (tone: string): string => {
    if (tone === 'primary') return 'bg-[var(--primary)] text-white shadow-sm';
    if (tone === 'teal')    return 'bg-[var(--teal)] text-white shadow-sm';
    if (tone === 'crimson') return 'bg-[var(--crimson)] text-white shadow-sm';
    if (tone === 'amber')   return 'bg-[var(--amber)] text-white shadow-sm';
    return 'bg-[var(--surface2)] text-[var(--text)]';
  };
  const chipInactiveCls = 'bg-transparent text-[var(--text-2)] border-[var(--border)] hover:bg-[var(--surface2)] hover:text-[var(--text)]';

  // Supplier options for the dropdown
  const supplierOptions = $derived([
    { value: '', label: 'All suppliers' },
    ...((data as any).suppliers as any[]).map((s) => ({ value: s.id, label: s.name })),
  ]);

  // Date label for a PO (placed or expected)
  function dateLabel(po: any): string {
    if (po.received_date)   return `Received ${formatDate(po.received_date)}`;
    if (po.expected_delivery_date) return `Expected ${formatDate(po.expected_delivery_date)}`;
    return `Placed ${formatDate(po.order_date)}`;
  }
</script>

<svelte:head><title>Purchase Orders · Shëlf</title></svelte:head>

<header class="flex items-end justify-between gap-3 mb-5">
  <div class="min-w-0">
    <h1 class="text-[22px] md:text-[26px] font-semibold text-[var(--text)] tracking-tight">Purchase Orders</h1>
    <p class="text-xs text-[var(--text-3)]">
      {(data as any).totalMatching.toLocaleString()} order{(data as any).totalMatching === 1 ? '' : 's'}
      {#if (data as any).totalMatching > (data as any).orders.length} · page {(data as any).page}{/if}
    </p>
  </div>
  {#if auth.can('inventory.manage')}
    <a href="/restocking/orders/new" class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-[var(--radius-md)] bg-[var(--primary)] text-white hover:opacity-90 transition-opacity">
      <PackagePlus size={13} strokeWidth={2.2} /> New Order
    </a>
  {/if}
</header>

<!-- Filter bar -->
<div class="surface-card-flat p-3 mb-4">
  <div class="flex flex-col md:flex-row md:items-center gap-3">
    <div class="flex-1 min-w-0">
      <SearchBar
        value={q}
        oninput={onSearchInput}
        placeholder="Search by order ref, supplier, or notes…"
      />
    </div>
    <div class="flex items-center gap-2 flex-wrap md:flex-nowrap">
      <Select
        class="min-w-[180px]"
        value={(data as any).filters.supplier}
        options={supplierOptions}
        onchange={(v) => applyFilters({ supplier: v, page: 1 })}
      />
    </div>
  </div>

  <!-- Status chips with counts -->
  <div class="flex items-center justify-between gap-2 mt-3 flex-wrap">
    <div class="flex items-center gap-1.5 flex-wrap">
      {#each statusChips as chip}
        {@const active = (data as any).filters.status === chip.key}
        {@const count  = chipCount(chip.key)}
        {@const meta   = chip.key === 'all' ? null : STATUS_META[chip.key as Exclude<StatusKey, 'all'>]}
        {@const tone   = meta ? meta.tone : 'neutral'}
        <button
          type="button"
          role="tab"
          aria-selected={active}
          onclick={() => applyFilters({ status: chip.key, page: 1 })}
          class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-[var(--radius-pill)] border transition-all {active ? chipActiveCls(tone) : chipInactiveCls}"
        >
          {#if meta}
            <svelte:component this={meta.icon} size={11} strokeWidth={2.2} />
          {/if}
          {chip.label}
          <span class="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-semibold
            {active ? 'bg-white/20 text-white' : 'bg-[var(--surface2)] text-[var(--text-3)]'}">
            {count}
          </span>
        </button>
      {/each}
    </div>

    {#if hasFilters}
      <button
        onclick={clearAll}
        class="inline-flex items-center gap-1 text-xs font-semibold text-[var(--text-3)] hover:text-[var(--text)] transition-colors"
      >
        <X size={12} strokeWidth={2} /> Clear filters
      </button>
    {/if}
  </div>
</div>

{#if (data as any).orders.length === 0}
  <EmptyState
    icon={hasFilters ? 'Search' : 'PackagePlus'}
    title={hasFilters ? 'No matches' : 'No purchase orders yet'}
    message={hasFilters ? 'Try adjusting or clearing your filters.' : 'Create a PO to track supplier orders and receive deliveries.'}
  >
    {#snippet action()}
      {#if hasFilters}
        <button class="btn btn-secondary btn-sm" onclick={clearAll}>Clear filters</button>
      {:else if auth.can('inventory.manage')}
        <a href="/restocking/orders/new" class="btn btn-primary btn-sm gap-1.5">
          <PackagePlus size={13} strokeWidth={2.2} /> Create your first PO
        </a>
      {/if}
    {/snippet}
  </EmptyState>
{:else}
  <!-- Cards list -->
  <div class="space-y-2 stagger-fade">
    {#each (data as any).orders as po (po.id)}
      {@const meta = STATUS_META[po.status as Exclude<StatusKey, 'all'>] ?? STATUS_META.ordered}
      {@const itemCount = (po.items ?? []).length}
      <a
        href="/restocking/orders/{po.id}"
        class="surface-card p-3 md:p-4 flex items-center gap-3 hover:border-[color-mix(in_srgb,var(--primary)_30%,var(--border))] hover:-translate-y-0.5 hover:shadow-[var(--shadow-sm)] transition-all"
      >
        <!-- Status icon -->
        <div class="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style="background:{meta.bg}">
          <svelte:component this={meta.icon} size={16} strokeWidth={2} style="color:{meta.color}" />
        </div>

        <!-- Main info -->
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <p class="font-mono text-[11px] font-semibold text-[var(--primary)]">{po.order_ref}</p>
            <span class="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style="background:{meta.bg}; color:{meta.color}">{meta.label}</span>
          </div>
          <div class="flex items-center gap-1.5 mt-0.5">
            <p class="text-[12px] font-medium text-[var(--text)] truncate">
              {po.supplier?.name ?? 'Unknown supplier'}
            </p>
            <span class="text-[10px] text-[var(--text-3)]">·</span>
            <p class="text-[10px] text-[var(--text-3)] whitespace-nowrap">{dateLabel(po)}</p>
            {#if itemCount > 0}
              <span class="text-[10px] text-[var(--text-3)] hidden sm:inline">·</span>
              <p class="text-[10px] text-[var(--text-3)] hidden sm:block">
                {itemCount} item{itemCount === 1 ? '' : 's'}
              </p>
            {/if}
          </div>
        </div>

        <!-- Total -->
        <div class="text-right shrink-0">
          <p class="text-[14px] font-bold tabular-nums">{formatCurrencyCompact(po.total_cost)}</p>
          {#if po.shipping_cost > 0 || po.tax_amount > 0}
            <p class="text-[10px] text-[var(--text-3)] tabular-nums">
              net {formatCurrency(po.subtotal)}
            </p>
          {/if}
        </div>
      </a>
    {/each}
  </div>

  <!-- Pagination -->
  <div class="flex items-center justify-between mt-4 text-xs">
    <button
      class="btn btn-secondary btn-sm gap-1 {(data as any).page <= 1 ? 'opacity-40 pointer-events-none' : ''}"
      onclick={prevPage}
    ><ChevronLeft size={13} strokeWidth={2} /> Prev</button>
    <span class="text-[var(--text-3)]">Page {(data as any).page} · showing {(data as any).orders.length}</span>
    <button
      class="btn btn-secondary btn-sm gap-1 {(data as any).orders.length < (data as any).limit ? 'opacity-40 pointer-events-none' : ''}"
      onclick={nextPage}
    >Next <ChevronRight size={13} strokeWidth={2} /></button>
  </div>
{/if}
