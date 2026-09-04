<script lang="ts">
  import { page }       from '$app/stores';
  import { browser }    from '$app/environment';
  import { formatCurrency, formatCurrencyCompact } from '$lib/utils/format';
  import { auth }       from '$lib/stores/auth.svelte';
  import { toasts }     from '$lib/stores/toast.svelte';
  import { inventory as invStore } from '$lib/stores/inventory.svelte';
  import { fuzzyFilter } from '$lib/utils/fuzzy';
  import PageShell   from '$lib/components/layout/PageShell.svelte';
  import SearchBar   from '$lib/components/ui/SearchBar.svelte';
  import Button      from '$lib/components/ui/Button.svelte';
  import Sheet from '$lib/components/ui/Sheet.svelte';
  import ConfirmModal from '$lib/components/ui/ConfirmModal.svelte';
  import Input       from '$lib/components/ui/Input.svelte';
  import Select      from '$lib/components/ui/Select.svelte';
  import Toggle      from '$lib/components/ui/Toggle.svelte';
  import EmptyState  from '$lib/components/ui/EmptyState.svelte';
  import KpiCard     from '$lib/components/ui/KpiCard.svelte';
  import DynamicIcon from '$lib/components/ui/DynamicIcon.svelte';
  import { inview } from '$lib/utils/inview';
  import { Plus, Pencil, PackagePlus, Trash2, ArrowUpDown, X, Package } from 'lucide-svelte';
  import { appConfig } from '$lib/config/app';
  import { invalidateAll } from '$app/navigation';
  import { fly } from 'svelte/transition';

  let { data } = $props();

  // Sync the inventory store when server data changes (after invalidation).
  $effect(() => { invStore.init(data.products as any[]); });

  /* ── Filter & sort state ────────────────────────────────── */
  let search     = $state('');
  let filterCat  = $state('');
  type StockFilter = 'all' | 'in' | 'low' | 'out';
  let stockFilter = $state<StockFilter>(
    $page.url.searchParams.get('filter') === 'alerts' ? 'low' : 'all'
  );
  type SortKey = 'name-asc' | 'name-desc' | 'stock-asc' | 'stock-desc' | 'updated-desc';
  let sortKey    = $state<SortKey>('name-asc');

  let showAdd     = $state(false);
  let showDelete  = $state(false);
  let editTarget  = $state<any>(null);
  let deleteTarget = $state<any>(null);
  let saving      = $state(false);

  // Tracks which product ids currently have their IntersectionObserver mounted
  // and inside the viewport buffer.
  //   - SSR (browser === false): all items render real cards (no skeletons
  //     on first paint).
  //   - Client mount: observer is set up on every wrapper. The rootMargin
  //     buffer (400px) means at first paint every visible item intersects,
  //     so the observer immediately marks them visible. Off-screen items
  //     have their IDs removed from the set, which swaps them to skeletons.
  //   - When the filter changes, the $effect below re-seeds to the new
  //     full set so newly-included items become visible immediately
  //     without waiting for the observer to catch up.
  let visibleIds = $state<Set<string>>(new Set());
  let mounted = $state(false);

  function setVisible(id: string, v: boolean) {
    if (v) {
      if (!visibleIds.has(id)) visibleIds.add(id);
    } else {
      visibleIds.delete(id);
    }
  }

  // On client mount, seed visibility to all filtered ids so the first paint
  // shows real cards. The observer will then trim as the user scrolls.
  // SSR also starts with the full set so the server-rendered HTML is real
  // cards (avoids a flash of skeletons on hydration).
  $effect(() => {
    visibleIds = new Set(filtered.map((p: any) => p.id));
    if (!mounted) mounted = true;
  });

  let form = $state({
    name: '', sku: '', price: '', cost_price: '',
    qty: '', unit: 'piece', category: '', description: '',
    // Toggles default ON for new products. When OFF the matching field
    // is hidden in the form and ignored on submit. Toggling OFF and
    // back ON keeps the value the user already typed (so they can
    // re-enable tracking without re-entering the barcode/threshold).
    track_stock: true,
    track_barcode: true,
    low_stock_threshold: '',
    barcode: '',
  });

  /* ── Derived helpers ────────────────────────────────────── */
  /**
   * Effective threshold for a product. If the product has opted out
   * of low-stock tracking (track_stock=false), return Infinity so the
   * comparisons in stockStats/getStockBadge always say "in stock" and
   * the product is excluded from low-stock KPI counts.
   */
  const thresholdOf = (p: any) =>
    p.track_stock === false ? Infinity : (p.low_stock_threshold ?? data.threshold);

  /**
   * NOTE: `$derived` evaluates an EXPRESSION. The original code wrapped the
   * body in `() => { ... }` which made `stockStats` a function-of-closure
   * instead of a reactive value — KPIs and chip counts never updated after
   * invalidation. Fixed: derive the object.
   */
  const stockStats = $derived.by(() => {
    const list = data.products as any[];
    let inStock = 0, low = 0, out = 0, value = 0;
    for (const p of list) {
      if (p.qty === 0) out++;
      else if (p.qty <= thresholdOf(p)) low++;
      else inStock++;
      value += (p.price || 0) * (p.qty || 0);
    }
    return { total: list.length, inStock, low, out, value };
  });

  const filtered = $derived.by(() => {
    let list = (data.products as any[]).slice();
    const q = search.toLowerCase().trim();
    if (filterCat) {
      list = list.filter(p => {
        const catId = typeof p.category === 'string' ? p.category : p.category?.id;
        return catId === filterCat;
      });
    }
    if (q) {
      list = fuzzyFilter(list, q, {
        fields: [
          { get: (p: any) => p.name,        weight: 2 },
          { get: (p: any) => p.sku,         weight: 1.5 },
          { get: (p: any) => p.description, weight: 0.5 },
          { get: (p: any) => p.category?.name ?? p.category },
        ],
      });
    }
    if (stockFilter === 'in')  list = list.filter(p => p.qty >  thresholdOf(p));
    if (stockFilter === 'low') list = list.filter(p => p.qty >  0 && p.qty <= thresholdOf(p));
    if (stockFilter === 'out') list = list.filter(p => p.qty === 0);

    switch (sortKey) {
      case 'name-asc':     list.sort((a, b) => a.name.localeCompare(b.name)); break;
      case 'name-desc':    list.sort((a, b) => b.name.localeCompare(a.name)); break;
      case 'stock-asc':    list.sort((a, b) => (a.qty || 0) - (b.qty || 0));  break;
      case 'stock-desc':   list.sort((a, b) => (b.qty || 0) - (a.qty || 0));  break;
      case 'updated-desc': list.sort((a, b) =>
        new Date(b.date_updated || b.date_created || 0).getTime() -
        new Date(a.date_updated || a.date_created || 0).getTime()
      ); break;
    }
    return list;
  });

  const activeFilterCount = $derived(
    (search.trim() ? 1 : 0) +
    (filterCat    ? 1 : 0) +
    (stockFilter !== 'all' ? 1 : 0)
  );

  function clearAll() {
    search = '';
    filterCat = '';
    stockFilter = 'all';
  }

  function getStockBadge(p: any) {
    // If the product has opted out of low-stock tracking, never flag it.
    if (p.track_stock === false) {
      // If it's actually out of stock, that's still useful to surface
      // (you might want to restock even uncounted items). Otherwise
      // we just say "In stock" — no low-stock warning.
      if (p.qty === 0) return { label: 'Out of stock', cls: 'badge-crimson' };
      return { label: 'In stock', cls: 'badge-teal' };
    }
    if (p.qty === 0) return { label: 'Out of stock', cls: 'badge-crimson' };
    if (p.qty <= thresholdOf(p)) return { label: `Low — ${p.qty}`, cls: 'badge-gold' };
    return { label: 'In stock', cls: 'badge-teal' };
  }

  function stockPct(p: any): number {
    const cap = Math.max(thresholdOf(p) * 2, 10);
    return Math.min(100, Math.round((p.qty / cap) * 100));
  }

  function stockBarColor(p: any): string {
    // Uncounted items use a neutral teal bar regardless of qty
    // (except qty=0, which is still worth highlighting).
    if (p.track_stock === false) {
      return p.qty === 0 ? 'var(--crimson)' : 'var(--teal)';
    }
    if (p.qty === 0) return 'var(--crimson)';
    if (p.qty <= thresholdOf(p)) return 'var(--gold)';
    return 'var(--teal)';
  }

  function marginPct(p: any): number | null {
    if (!p.cost_price || !p.price) return null;
    return Math.round(((p.price - p.cost_price) / p.price) * 100);
  }

  function openAdd() {
    form = {
      name: '', sku: '', price: '', cost_price: '',
      qty: '0', unit: 'piece', category: '', description: '',
      track_stock: true, track_barcode: true,
      low_stock_threshold: '', barcode: '',
    };
    editTarget = null; showAdd = true;
  }

  function openEdit(p: any) {
    form = {
      name: p.name, sku: p.sku,
      price:      String(p.price),
      cost_price: String(p.cost_price),
      qty:        String(p.qty),
      unit:       p.unit,
      category:   p.category?.id ?? p.category ?? '',
      description: p.description ?? '',
      // Derive the toggles from the row. track_* columns are NOT NULL
      // with default true, so this is always defined for real rows.
      // For PATCH bodies from old clients that don't send these, the
      // server defaults to true.
      track_stock:   p.track_stock   !== false,
      track_barcode: p.track_barcode !== false,
      low_stock_threshold: p.low_stock_threshold ? String(p.low_stock_threshold) : '',
      barcode:    p.barcode ?? '',
    };
    editTarget = p; showAdd = true;
  }

  function confirmDelete(p: any) {
    deleteTarget = p;
    showDelete   = true;
  }

  async function saveProduct() {
    saving = true;
    const payload = {
      name:                form.name,
      sku:                 form.sku,
      price:               parseFloat(form.price  || '0'),
      cost_price:          parseFloat(form.cost_price || '0'),
      qty:                 parseInt(form.qty || '0'),
      unit:                form.unit,
      category:            form.category || null,
      description:         form.description || null,
      // Toggles drive whether the field is even sent. The server
      // clears the matching column when the toggle goes OFF.
      track_stock:         !!form.track_stock,
      track_barcode:       !!form.track_barcode,
      low_stock_threshold: form.track_stock && form.low_stock_threshold
                             ? parseInt(form.low_stock_threshold) : null,
      // Empty string → null so the DB stores no barcode, not an
      // empty string.  The unique index ignores nulls.
      barcode:             form.barcode.trim() || null,
    };
    const url    = editTarget ? `/api/products/${editTarget.id}` : '/api/products';
    const method = editTarget ? 'PATCH' : 'POST';
    const res    = await fetch(url, {
      method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    if (res.ok) {
      toasts.success(editTarget ? 'Product updated' : 'Product added');
      showAdd = false;
      await invalidateAll();
    } else toasts.error('Failed to save product');
    saving = false;
  }

  async function doDelete() {
    if (!deleteTarget) return;
    const res = await fetch(`/api/products/${deleteTarget.id}`, { method: 'DELETE' });
    if (res.ok) {
      toasts.success('Product archived');
      showDelete = false;
      deleteTarget = null;
      await invalidateAll();
    } else toasts.error('Failed to archive');
  }

  const catOptions = $derived([
    { value: '', label: 'All categories' },
    ...(data.categories as any[]).map((c: any) => ({ value: c.id, label: c.name })),
  ]);
  const unitOptions = appConfig.inventory.units.map(u => ({ value: u, label: u }));
  const sortOptions = [
    { value: 'name-asc',     label: 'Name · A → Z' },
    { value: 'name-desc',    label: 'Name · Z → A' },
    { value: 'stock-desc',   label: 'Stock · High → Low' },
    { value: 'stock-asc',    label: 'Stock · Low → High' },
    { value: 'updated-desc', label: 'Recently updated' },
  ];

  type ChipKey = StockFilter;
  const stockChips: { key: ChipKey; label: string; tone: 'neutral' | 'teal' | 'gold' | 'crimson' }[] = [
    { key: 'all', label: 'All',      tone: 'neutral' },
    { key: 'in',  label: 'In stock', tone: 'teal'    },
    { key: 'low', label: 'Low',      tone: 'gold'    },
    { key: 'out', label: 'Out',      tone: 'crimson' },
  ];

  /** Chip count, looked up against the reactive `stockStats` object */
  function chipCount(key: ChipKey): number {
    if (key === 'all') return stockStats.total;
    if (key === 'in')  return stockStats.inStock;
    if (key === 'low') return stockStats.low;
    return stockStats.out;
  }

  const chipActiveCls = (tone: 'neutral' | 'teal' | 'gold' | 'crimson'): string => {
    const map = {
      primary: 'bg-[var(--primary)] text-[var(--primary-fg)] shadow-sm',
      teal:    'bg-[var(--teal)] text-white shadow-sm',
      gold:    'bg-[var(--gold)] text-white shadow-sm',
      crimson: 'bg-[var(--crimson)] text-white shadow-sm',
      neutral: 'bg-[var(--surface2)] text-[var(--text)]',
    };
    return map[tone] + ' border-transparent';
  };
  const chipInactiveCls = 'bg-transparent text-[var(--text-2)] border-[var(--border)] hover:bg-[var(--surface2)] hover:text-[var(--text)]';
</script>

<svelte:head><title>Inventory · Shëlf</title></svelte:head>

<div class="fade-up">
  <!-- Header -->
  <div class="flex items-end justify-between gap-3 mb-4">
    <div class="flex-1 min-w-0">
<h1 class="text-[22px] md:text-[26px] font-semibold text-[var(--text)] tracking-tight">
        Inventory
      </h1>
    </div>
    {#if auth.can('inventory.manage')}
      <div class="flex gap-2 shrink-0">
        <Button onclick={() => window.location.href = '/restocking/orders/new'} variant="secondary" size="sm">
          <PackagePlus size={14} strokeWidth={2} /> Restock
        </Button>
        <Button onclick={openAdd} size="sm"><Plus size={14} strokeWidth={2} /> Add product</Button>
      </div>
    {/if}
  </div>

  <!-- KPI strip -->
  <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5 anim-stagger">
    <KpiCard
      label="Total products"
      value={String(stockStats.total)}
      icon="Package"
      iconColor="var(--primary)"
      sub="In catalog"
    />
    <KpiCard
      label="Stock value"
      value={formatCurrencyCompact(stockStats.value)}
      icon="Wallet"
      iconColor="var(--cobalt)"
      sub="At selling price"
    />
    <KpiCard
      label="Low stock"
      value={String(stockStats.low)}
      icon="AlertTriangle"
      iconColor={stockStats.low > 0 ? 'var(--gold)' : 'var(--teal)'}
      sub={stockStats.low > 0 ? 'Needs restocking' : 'All good'}
    />
    <KpiCard
      label="Out of stock"
      value={String(stockStats.out)}
      icon="Package"
      iconColor={stockStats.out > 0 ? 'var(--crimson)' : 'var(--teal)'}
      sub={stockStats.out > 0 ? 'Cannot fulfill' : 'All good'}
    />
  </div>

  <!-- Filter bar -->
  <div class="surface-card-flat p-3 mb-4">
    <div class="flex flex-col md:flex-row md:items-center gap-3">
      <div class="flex-1 min-w-0">
        <SearchBar bind:value={search} placeholder="Search by name, SKU or description…" />
      </div>

      <div class="flex items-center gap-2 flex-wrap md:flex-nowrap">
        <Select
          class="min-w-[150px]"
          bind:value={filterCat}
          options={catOptions}
        />
        <div class="relative">
          <ArrowUpDown size={13} strokeWidth={1.75} class="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-3)] pointer-events-none" />
          <select
            bind:value={sortKey}
            class="input pl-8 pr-3 text-sm"
            style="min-width:170px"
            aria-label="Sort"
          >
            {#each sortOptions as opt}<option value={opt.value}>{opt.label}</option>{/each}
          </select>
        </div>
      </div>
    </div>

    <!-- Status chips + active-filter indicator -->
    <div class="flex items-center justify-between gap-2 mt-3 flex-wrap">
      <div class="flex items-center gap-1.5 flex-wrap" role="tablist" aria-label="Filter by stock status">
        {#each stockChips as chip}
          {@const active = stockFilter === chip.key}
          {@const count  = chipCount(chip.key)}
          <button
            type="button"
            role="tab"
            aria-selected={active}
            onclick={() => stockFilter = chip.key}
            class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-[var(--radius-pill)] border transition-all {active ? chipActiveCls(chip.tone) : chipInactiveCls}"
          >
            {chip.label}
            <span class="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-semibold
              {active ? 'bg-white/20 text-white' : 'bg-[var(--surface2)] text-[var(--text-3)]'}">
              {count}
            </span>
          </button>
        {/each}
      </div>

      {#if activeFilterCount > 0}
        <button
          onclick={clearAll}
          class="inline-flex items-center gap-1 text-xs font-semibold text-[var(--text-3)] hover:text-[var(--text)] transition-colors"
        >
          <X size={12} strokeWidth={2} />
          Clear {activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''}
        </button>
      {/if}
    </div>
  </div>

  <!-- Cards grid (replaces table) -->
  {#if filtered.length === 0}
    <EmptyState icon="Package" title="No products found" message="Try adjusting your search or filters.">
      {#snippet action()}
        {#if auth.can('inventory.manage')}
          <Button onclick={openAdd} size="sm"><Plus size={14} strokeWidth={2} /> Add first product</Button>
        {/if}
      {/snippet}
    </EmptyState>
  {:else}
    <div class="text-xs text-[var(--text-3)] mb-2 px-1">
      Showing <span class="font-semibold text-[var(--text-2)]">{filtered.length}</span>
      of {stockStats.total} products
    </div>
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 anim-stagger">
      {#each filtered as p (p.id)}
        {@const badge  = getStockBadge(p)}
        {@const pct    = stockPct(p)}
        {@const margin = marginPct(p)}
        {@const catColor = p.category?.color ?? 'var(--primary)'}
        <div
          class="inv-grid-item"
          use:inview={(v) => setVisible(p.id, v)}
        >
          {#if !browser || !mounted || visibleIds.has(p.id)}
            <div
              class="surface-card interactive p-4 group"
              in:fly={{ y: 8, duration: 220 }}
              out:fly={{ y: -8, duration: 160 }}
            >
              <!-- Top: icon + name + actions -->
              <div class="flex items-start gap-3">
                <div class="w-10 h-10 rounded-lg flex-shrink-0 flex items-center justify-center"
                     style="background:color-mix(in srgb,{catColor} 15%,transparent)">
                  <DynamicIcon name={p.category?.icon ?? 'Package'} size={16}
                               style="color:{catColor}" />
                </div>
                <div class="flex-1 min-w-0">
                  <p class="text-[13px] font-semibold truncate" title={p.name}>{p.name}</p>
                  <div class="flex items-center gap-1.5 mt-0.5">
                    <span class="font-mono text-[10px] text-[var(--text-3)]">{p.sku}</span>
                    {#if p.category?.name}
                      <span class="text-[10px] text-[var(--text-3)]">·</span>
                      <span class="text-[10px] text-[var(--text-2)] truncate">{p.category.name}</span>
                    {/if}
                  </div>
                </div>
                {#if auth.can('inventory.manage')}
                  <div class="flex items-center gap-0.5 opacity-50 hover:opacity-100 transition-opacity">
                    <button class="btn btn-ghost btn-icon btn-sm" title="Edit" onclick={() => openEdit(p)} aria-label={`Edit ${p.name}`}>
                      <Pencil size={13} strokeWidth={1.75} />
                    </button>
                    <button class="btn btn-ghost btn-icon btn-sm text-[var(--crimson)]"
                            title="Archive" onclick={() => confirmDelete(p)} aria-label={`Archive ${p.name}`}>
                      <Trash2 size={13} strokeWidth={1.75} />
                    </button>
                  </div>
                {/if}
              </div>

              <!-- Price row -->
              <div class="flex items-baseline justify-between mt-3">
                <p class="text-lg font-bold tabular-nums">{formatCurrency(p.price)}</p>
                {#if margin !== null}
                  <span class="text-[10px] font-semibold {margin >= 30 ? 'text-[var(--teal-fg)]' : margin >= 15 ? 'text-[var(--gold-fg)]' : 'text-[var(--crimson-fg)]'}"
                        title="Gross margin">
                    {margin}% margin
                  </span>
                {/if}
              </div>

              <!-- Stock section: bar + qty + status -->
              <div class="mt-3">
                <div class="flex items-center justify-between mb-1.5">
                  <span class="text-[10px] uppercase tracking-wide font-semibold text-[var(--text-3)]">Stock</span>
                  <span class="text-[12px] font-semibold tabular-nums">
                    {p.qty}<span class="text-[var(--text-3)] font-normal"> {p.unit ?? 'in stock'}</span>
                  </span>
                </div>
                <div class="flex items-center gap-2">
                  <div class="flex-1 h-1.5 rounded-full bg-[var(--surface2)] overflow-hidden">
                    <div class="h-full rounded-full transition-all"
                         style="width:{pct}%; background:{stockBarColor(p)}"></div>
                  </div>
                  <span class="badge {badge.cls} text-[10px] whitespace-nowrap">{badge.label}</span>
                </div>
              </div>
            </div>
          {:else}
            <!-- Skeleton placeholder: holds grid space, no content rendered -->
            <div class="surface-card p-4 inv-skeleton" aria-hidden="true">
              <div class="flex items-start gap-3">
                <div class="w-10 h-10 rounded-lg bg-[var(--surface2)]"></div>
                <div class="flex-1 space-y-1.5">
                  <div class="h-3 w-3/4 rounded bg-[var(--surface2)]"></div>
                  <div class="h-2.5 w-1/2 rounded bg-[var(--surface2)]"></div>
                </div>
              </div>
              <div class="h-5 w-1/3 rounded bg-[var(--surface2)] mt-3"></div>
              <div class="h-3 w-full rounded bg-[var(--surface2)] mt-3"></div>
              <div class="h-1.5 w-full rounded bg-[var(--surface2)] mt-1.5"></div>
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

<Sheet bind:open={showAdd} title={editTarget ? 'Edit product' : 'Add product'} maxWidth="max-w-lg">
  <form onsubmit={(e) => { e.preventDefault(); saveProduct(); }} class="flex flex-col gap-3">
    <Input label="Name" bind:value={form.name} required />
    <div class="grid grid-cols-2 gap-3">
      <Input label="SKU"  bind:value={form.sku}  required />
      <Select label="Unit" bind:value={form.unit} options={unitOptions} />
    </div>
    <div class="grid grid-cols-2 gap-3">
      <Input label="Selling price" type="number" bind:value={form.price}      hint="e.g. 25.00" required />
      <Input label="Cost price"    type="number" bind:value={form.cost_price} hint="optional" />
    </div>
    <div class="grid grid-cols-2 gap-3">
      <Input label="Qty in stock" type="number" bind:value={form.qty} />
    </div>

    <!-- ─── Track barcode + low-stock toggles (side by side) ──
         The description for each toggle is a `?` tooltip so the
         toggle rows stay compact and on the same line. -->
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div class="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface2)]/40">
        <p class="flex-1 text-xs font-semibold text-[var(--text)]">Barcode</p>
        <span
          class="inline-flex items-center justify-center w-4 h-4 rounded-full
                 text-[9px] font-semibold leading-none text-[var(--text-3)]
                 ring-1 ring-inset ring-[var(--border)]"
          aria-label="What does tracking a barcode do?"
          title="Track a barcode for this product. Disable for items sold loose or in bulk."
        >?</span>
        <Toggle bind:checked={form.track_barcode} />
      </div>
      <div class="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface2)]/40">
        <p class="flex-1 text-xs font-semibold text-[var(--text)]">Low-stock alerts</p>
        <span
          class="inline-flex items-center justify-center w-4 h-4 rounded-full
                 text-[9px] font-semibold leading-none text-[var(--text-3)]
                 ring-1 ring-inset ring-[var(--border)]"
          aria-label="What do low-stock alerts do?"
          title="Show a warning when quantity drops to or below the alert level. Disable for items you don't count, like samples or custom orders."
        >?</span>
        <Toggle bind:checked={form.track_stock} />
      </div>
    </div>
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {#if form.track_barcode}
        <Input label="Barcode" bind:value={form.barcode} hint="Optional — scan with the in-app camera to add to cart" />
      {/if}
      {#if form.track_stock}
        <Input label="Low-stock alert at" type="number" bind:value={form.low_stock_threshold} hint="e.g. 5" />
      {/if}
    </div>
    <Select label="Category" bind:value={form.category}
      options={[{ value: '', label: 'No category' },
                ...(data.categories as any[]).map((c: any) => ({ value: c.id, label: c.name }))]} />
    <div class="input-group">
      <label class="input-label">Description</label>
      <textarea bind:value={form.description} class="input" rows="2" placeholder="Optional notes"></textarea>
    </div>
  </form>
  {#snippet footer()}
    <div class="flex justify-end gap-2">
      <Button variant="secondary" onclick={() => showAdd = false}>Cancel</Button>
      <Button loading={saving} onclick={saveProduct}>Save product</Button>
    </div>
  {/snippet}
</Sheet>

<ConfirmModal
  bind:open={showDelete}
  title="Archive product"
  message="Archive {deleteTarget?.name ?? 'this product'}? Sales history is preserved — it just won't appear in the POS."
  danger
  onconfirm={doDelete}
  oncancel={() => { showDelete = false; deleteTarget = null; }}
/>