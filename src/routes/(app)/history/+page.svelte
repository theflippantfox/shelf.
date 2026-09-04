<script lang="ts">
  import { goto } from '$app/navigation';
  import { formatCurrency, formatCurrencyCompact, formatDateTime, formatRelative } from '$lib/utils/format';
  import PageShell  from '$lib/components/layout/PageShell.svelte';
  import EmptyState from '$lib/components/ui/EmptyState.svelte';
  import SearchBar  from '$lib/components/ui/SearchBar.svelte';
  import Select     from '$lib/components/ui/Select.svelte';
  import {
    Banknote, Clock, ArrowLeftRight,
    ChevronLeft, ChevronRight, X,
  } from "lucide-svelte";

  let { data } = $props();

  const PAY_META: Record<string, { icon: any; label: string; color: string }> = {
    cash:     { icon: Banknote,        label: 'Cash',     color: 'var(--teal)'    },
    // 'credit' is now "customer owes money" (not "card" — that was the old alias)
    credit:   { icon: Clock,           label: 'Credit',   color: 'var(--gold)'    },
    transfer: { icon: ArrowLeftRight,  label: 'UPI',      color: 'var(--primary)' },
  };

  // Credit status chip on each row. Color-coded so the eye picks them up.
  function creditChip(credit_status: string) {
    if (credit_status === 'partial') return { label: 'Partial', tone: 'bg-[var(--gold)] text-[var(--gold-fg)]' };
    if (credit_status === 'pending') return { label: 'Pending', tone: 'bg-[var(--crimson)] text-white' };
    if (credit_status === 'paid')    return { label: 'Paid',    tone: 'bg-[var(--teal)] text-[var(--teal-fg)]' };
    return null;
  }

  // ── Local search state (URL is the source of truth, but we keep a debounced
  //    value locally so typing feels instant without hammering the server) ──
  let q = $state('');
  // Sync from URL whenever server-side filters change (after navigation).
  $effect(() => { q = (data as any).filters.q; });

  let searchTimer: ReturnType<typeof setTimeout> | null = null;
  function onSearchInput(v: string) {
    q = v;
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => applyFilters({ q: v, page: 1 }), 350);
  }

  // ── URL-driven param builders ───────────────────────────────────────────
  function buildUrl(overrides: Record<string, string | number | null | undefined>): string {
    const params = new URLSearchParams();
    const base = {
      q:      (data as any).filters.q,
      method: (data as any).filters.method,
      status: (data as any).filters.status,
      credit: (data as any).filters.credit,
      range:  (data as any).filters.range,
      page:   String((data as any).page),
    };
    const merged = { ...base, ...overrides };
    for (const [k, v] of Object.entries(merged)) {
      if (v === null || v === undefined) continue;
      const s = String(v);
      // Skip defaults to keep the URL clean
      if ((k === 'q'      && s === '')     ||
          (k === 'method' && s === '')     ||
          (k === 'status' && s === 'all')  ||
          (k === 'credit' && s === 'all')  ||
          (k === 'range'  && s === 'all')  ||
          (k === 'page'   && s === '1')) continue;
      params.set(k, s);
    }
    const qs = params.toString();
    return qs ? `/history?${qs}` : '/history';
  }

  function applyFilters(overrides: Record<string, string | number | null | undefined>) {
    goto(buildUrl(overrides), { replaceState: true, keepFocus: true, noScroll: true });
  }

  function clearAll() {
    if (searchTimer) clearTimeout(searchTimer);
    goto('/history', { replaceState: true, keepFocus: true, noScroll: true });
  }

  const hasFilters = $derived(
    (data as any).filters.q !== '' ||
    (data as any).filters.method !== '' ||
    (data as any).filters.status !== 'all' ||
    (data as any).filters.range !== 'all'
  );

  // ── Pagination ──────────────────────────────────────────────────────────
  function prevPage() {
    if ((data as any).page <= 1) return;
    applyFilters({ page: (data as any).page - 1 });
  }
  function nextPage() {
    if ((data as any).sales.length < (data as any).limit) return;
    applyFilters({ page: (data as any).page + 1 });
  }

  // ── Filter option sets ──────────────────────────────────────────────────
  const methodOptions = [
    { value: '',         label: 'All methods' },
    { value: 'cash',     label: 'Cash' },
    { value: 'credit',   label: 'Card' },
    { value: 'transfer', label: 'Transfer' },
  ];

  type StatusKey = 'all' | 'complete' | 'voided';
  type RangeKey  = 'all' | 'today' | '7d' | '30d';

  const statusChips: { key: StatusKey; label: string; tone: 'neutral' | 'teal' | 'crimson' }[] = [
    { key: 'all',      label: 'All',      tone: 'neutral' },
    { key: 'complete', label: 'Complete', tone: 'teal'    },
    { key: 'voided',   label: 'Voided',   tone: 'crimson' },
  ];

  const rangeChips: { key: RangeKey; label: string }[] = [
    { key: 'all',   label: 'All time' },
    { key: 'today', label: 'Today' },
    { key: '7d',    label: '7 days' },
    { key: '30d',   label: '30 days' },
  ];

  function chipCount(map: Record<StatusKey, number> | Record<RangeKey, number>, key: string): number {
    return (map as any)[key] ?? 0;
  }

  const chipActiveCls = (tone: 'neutral' | 'teal' | 'crimson'): string => {
    const map = {
      primary: 'bg-[var(--primary)] text-[var(--primary-fg)] shadow-sm',
      teal:    'bg-[var(--teal)] text-white shadow-sm',
      crimson: 'bg-[var(--crimson)] text-white shadow-sm',
      neutral: 'bg-[var(--surface2)] text-[var(--text)]',
    };
    return map[tone] + ' border-transparent';
  };
  const chipInactiveCls = 'bg-transparent text-[var(--text-2)] border-[var(--border)] hover:bg-[var(--surface2)] hover:text-[var(--text)]';
</script>

<svelte:head><title>Sales History · Shëlf</title></svelte:head>

<!-- Header -->
  <header class="flex items-end justify-between gap-3 mb-5">
  <div class="min-w-0">
<h1 class="text-[22px] md:text-[26px] font-semibold text-[var(--text)] tracking-tight">Sales History</h1>
    <p class="text-xs text-[var(--text-3)]">
        {(data as any).totalMatching.toLocaleString()} matching sale{(data as any).totalMatching === 1 ? '' : 's'}
        {#if (data as any).totalMatching > (data as any).sales.length} · page {(data as any).page}{/if}
      </p>
  </div>
  
</header>

  <!-- Filter bar -->
  <div class="surface-card-flat p-3 mb-4">
    <div class="flex flex-col md:flex-row md:items-center gap-3">
      <div class="flex-1 min-w-0">
        <SearchBar
          value={q}
          oninput={onSearchInput}
          placeholder="Search by sale ref, customer, item name or SKU…"
        />
      </div>
      <div class="flex items-center gap-2 flex-wrap md:flex-nowrap">
        <Select
          class="min-w-[140px]"
          value={(data as any).filters.method}
          options={methodOptions}
          onchange={(v) => applyFilters({ method: v, page: 1 })}
        />
      </div>
    </div>

    <!-- Status + range chips -->
    <div class="flex items-center justify-between gap-2 mt-3 flex-wrap">
      <div class="flex items-center gap-1.5 flex-wrap">
        <!-- Status chips with counts -->
        {#each statusChips as chip}
          {@const active = (data as any).filters.status === chip.key}
          {@const count  = chipCount((data as any).counts, chip.key)}
          <button
            type="button"
            role="tab"
            aria-selected={active}
            onclick={() => applyFilters({ status: chip.key, page: 1 })}
            class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-[var(--radius-pill)] border transition-all {active ? chipActiveCls(chip.tone) : chipInactiveCls}"
          >
            {chip.label}
            <span class="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-semibold
              {active ? 'bg-white/20 text-white' : 'bg-[var(--surface2)] text-[var(--text-3)]'}">
              {count}
            </span>
          </button>
        {/each}

        <span class="text-[var(--text-3)] mx-1 text-xs">·</span>

        <!-- Credit-status chips (only render if there ARE any credit sales
             in the dataset — otherwise it's just visual noise) -->
        {#if (data as any).counts.credit_pending + (data as any).counts.credit_partial + (data as any).counts.credit_paid > 0}
          <span class="text-[10px] text-[var(--text-3)] font-semibold uppercase tracking-wider mr-1">Credit</span>
          {#each [
            { key: 'pending',  label: 'Pending',  count: (data as any).counts.credit_pending, tone: 'crimson' },
            { key: 'partial',  label: 'Partial',  count: (data as any).counts.credit_partial, tone: 'gold'    },
            { key: 'paid',     label: 'Paid',     count: (data as any).counts.credit_paid,    tone: 'teal'    },
          ] as cc}
            {@const active = (data as any).filters.credit === cc.key}
            <button
              type="button"
              role="tab"
              aria-selected={active}
              onclick={() => applyFilters({ credit: active ? 'all' : cc.key, page: 1 })}
              class="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-[var(--radius-pill)] border transition-all {active ? chipActiveCls(cc.tone) : chipInactiveCls}"
            >
              {cc.label}
              <span class="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-semibold
                {active ? 'bg-white/20 text-white' : 'bg-[var(--surface2)] text-[var(--text-3)]'}">
                {cc.count}
              </span>
            </button>
          {/each}
        {/if}

        <span class="text-[var(--text-3)] mx-1 text-xs">·</span>

        <!-- Range chips (no counts — date scope is mutually exclusive) -->
        {#each rangeChips as chip}
          {@const active = (data as any).filters.range === chip.key}
          <button
            type="button"
            onclick={() => applyFilters({ range: chip.key, page: 1 })}
            class="inline-flex items-center px-3 py-1.5 text-xs font-semibold rounded-[var(--radius-pill)] border transition-all {active ? chipActiveCls('neutral') : chipInactiveCls}"
          >
            {chip.label}
          </button>
        {/each}
      </div>

      {#if hasFilters}
        <button
          onclick={clearAll}
          class="inline-flex items-center gap-1 text-xs font-semibold text-[var(--text-3)] hover:text-[var(--text)] transition-colors"
        >
          <X size={12} strokeWidth={2} />
          Clear filters
        </button>
      {/if}
    </div>
  </div>

  {#if (data as any).sales.length === 0}
    <EmptyState
      icon={hasFilters ? 'Search' : 'Receipt'}
      title={hasFilters ? 'No matches' : 'No sales yet'}
      message={hasFilters ? 'Try adjusting or clearing your filters.' : 'Completed sales will appear here.'}
    >
      {#snippet action()}
        {#if hasFilters}
          <button class="btn btn-secondary btn-sm" onclick={clearAll}>Clear filters</button>
        {/if}
      {/snippet}
    </EmptyState>
  {:else}
    <!-- Cards list (replaces table for better mobile + scannability) -->
    <div class="space-y-2 stagger-fade">
      {#each (data as any).sales as s (s.id)}
        {@const meta    = PAY_META[s.payment_method]}
        {@const voided  = !!s.voided_at}
        <a
          href="/history/{s.id}"
          class="surface-card p-3 md:p-4 flex items-center gap-3 hover:border-[color-mix(in_srgb,var(--primary)_30%,var(--border))] hover:-translate-y-0.5 hover:shadow-[var(--shadow-sm)] transition-all
                 {voided ? 'opacity-60' : ''}"
        >
          <!-- Payment-method icon -->
          <div class="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
               style="background:color-mix(in srgb, {meta?.color ?? 'var(--text-3)'} 14%, transparent)">
            {#if meta}
              <meta.icon size={16} strokeWidth={2} style="color:{meta.color}" />
            {:else}
              <Banknote size={16} strokeWidth={2} class="text-[var(--text-3)]" />
            {/if}
          </div>

          <!-- Main info -->
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <p class="font-mono text-[11px] font-semibold text-[var(--primary)]">{s.sale_ref}</p>
              {#if voided}
                <span class="badge badge-crimson text-[9px]">Voided</span>
              {:else}
                <span class="badge badge-teal text-[9px]">Complete</span>
              {/if}
              {#if s.payment_method && meta}
                <span class="text-[10px] text-[var(--text-3)]">· {meta.label}</span>
              {/if}
              {#if !voided && s.payment_method === 'credit' && s.credit_status && s.credit_status !== 'paid'}
                {@const cc = creditChip(s.credit_status)}
                {#if cc}
                  <span class="text-[9px] font-bold px-1.5 py-0.5 rounded {cc.tone}">{cc.label}</span>
                  {#if s.credit_status === 'partial' && s.credit_amount_paid != null}
                    <span class="text-[10px] text-[var(--text-3)]">
                      paid {formatCurrency(s.credit_amount_paid)} of {formatCurrency(s.total)}
                    </span>
                  {/if}
                  {#if s.credit_due_date}
                    <span class="text-[10px] text-[var(--text-3)]">
                      due {new Date(s.credit_due_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    </span>
                  {/if}
                {/if}
              {/if}
            </div>
            <div class="flex items-center gap-1.5 mt-0.5">
              <p class="text-[12px] font-medium text-[var(--text)] truncate">
                {s.customer?.name ?? 'Walk-in'}
              </p>
              <span class="text-[10px] text-[var(--text-3)]">·</span>
              <p class="text-[10px] text-[var(--text-3)] whitespace-nowrap" title={formatDateTime(s.date_created)}>
                {formatRelative(s.date_created)}
              </p>
              {#if s.served_by?.first_name}
                <span class="text-[10px] text-[var(--text-3)] hidden sm:inline">·</span>
                <p class="text-[10px] text-[var(--text-3)] truncate hidden sm:block">
                  by {s.served_by.first_name} {s.served_by.last_name ?? ''}
                </p>
              {/if}
            </div>
          </div>

          <!-- Total -->
          <div class="text-right shrink-0">
            <p class="text-[14px] font-bold tabular-nums {voided ? 'line-through text-[var(--text-3)]' : ''}">
              {formatCurrencyCompact(s.total)}
            </p>
            <p class="text-[10px] text-[var(--text-3)] tabular-nums">
              {formatCurrency(s.subtotal)}
            </p>
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
      <span class="text-[var(--text-3)]">Page {(data as any).page} · showing {(data as any).sales.length}</span>
      <button
        class="btn btn-secondary btn-sm gap-1 {(data as any).sales.length < (data as any).limit ? 'opacity-40 pointer-events-none' : ''}"
        onclick={nextPage}
      >Next <ChevronRight size={13} strokeWidth={2} /></button>
    </div>
  {/if}
