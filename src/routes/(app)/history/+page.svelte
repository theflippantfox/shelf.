<script lang="ts">
  import { goto }         from '$app/navigation';
  import { formatCurrency, formatDateTime } from '$lib/utils/format';
  import PageShell  from '$lib/components/layout/PageShell.svelte';
  import EmptyState from '$lib/components/ui/EmptyState.svelte';
  import { Banknote, CreditCard, ArrowLeftRight, ChevronLeft, ChevronRight } from 'lucide-svelte';

  let { data } = $props();

  const PAY_ICON: Record<string, any> = {
    cash:     Banknote,
    credit:   CreditCard,
    transfer: ArrowLeftRight,
  };

  function prevPage() { if (data.page > 1) goto(`/history?page=${data.page - 1}`); }
  function nextPage() { if (data.sales.length === data.limit) goto(`/history?page=${data.page + 1}`); }
</script>

<svelte:head><title>Sales History · Shëlf</title></svelte:head>

<PageShell>
  <div class="page-header mb-4">
    <p class="text-base font-semibold">Sales History</p>
  </div>

  {#if (data.sales as any[]).length === 0}
    <EmptyState icon="ClipboardList" title="No sales yet" message="Completed sales appear here." />
  {:else}
    <div class="card overflow-hidden mb-4">
      <!-- Desktop table -->
      <table class="tbl hidden md:table">
        <thead>
          <tr>
            <th>Ref</th><th>Customer</th><th>Method</th>
            <th>Served by</th><th>Total</th><th>Date</th><th>Status</th>
          </tr>
        </thead>
        <tbody>
          {#each data.sales as s}
            <tr class={(s as any).voided_at ? 'opacity-40' : ''}>
              <td>
                <a href="/history/{(s as any).id}" class="font-mono text-[10px] text-[var(--primary)] hover:underline">
                  {(s as any).sale_ref}
                </a>
              </td>
              <td class="text-xs">{(s as any).customer?.name ?? 'Walk-in'}</td>
              <td>
                <span class="flex items-center gap-1 text-xs capitalize text-[var(--text-3)]">
                  <svelte:component this={PAY_ICON[(s as any).payment_method] ?? Banknote} size={11} strokeWidth={1.75} />
                  {(s as any).payment_method}
                </span>
              </td>
              <td class="text-xs text-[var(--text-3)]">
                {(s as any).served_by?.first_name ?? ''} {(s as any).served_by?.last_name ?? ''}
              </td>
              <td class="text-xs font-semibold">{formatCurrency((s as any).total)}</td>
              <td class="text-[10px] text-[var(--text-3)]">{formatDateTime((s as any).date_created)}</td>
              <td>
                {#if (s as any).voided_at}
                  <span class="badge badge-crimson text-[10px]">Voided</span>
                {:else}
                  <span class="badge badge-teal text-[10px]">Complete</span>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>

      <!-- Mobile list -->
      <div class="md:hidden">
        {#each data.sales as s}
          <a
            href="/history/{(s as any).id}"
            class="flex items-center gap-3 px-4 py-3 border-b last:border-0 border-[var(--border)] hover:bg-[var(--surface2)] transition-colors {(s as any).voided_at ? 'opacity-40' : ''}"
          >
            <div class="w-8 h-8 rounded-full bg-[var(--surface2)] flex items-center justify-center flex-shrink-0">
              <svelte:component this={PAY_ICON[(s as any).payment_method] ?? Banknote} size={14} strokeWidth={1.75} class="text-[var(--text-3)]" />
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <p class="text-[10px] font-mono text-[var(--primary)]">{(s as any).sale_ref}</p>
                {#if (s as any).voided_at}
                  <span class="badge badge-crimson text-[9px]">Voided</span>
                {/if}
              </div>
              <p class="text-[10px] text-[var(--text-3)]">
                {(s as any).customer?.name ?? 'Walk-in'} · {formatDateTime((s as any).date_created)}
              </p>
            </div>
            <p class="text-sm font-semibold">{formatCurrency((s as any).total)}</p>
          </a>
        {/each}
      </div>
    </div>

    <!-- Pagination -->
    <div class="flex items-center justify-between text-xs text-[var(--text-3)]">
      <button
        class="btn btn-secondary btn-sm gap-1 {data.page <= 1 ? 'opacity-40 pointer-events-none' : ''}"
        onclick={prevPage}
      ><ChevronLeft size={13} strokeWidth={2} /> Prev</button>
      <span>Page {data.page}</span>
      <button
        class="btn btn-secondary btn-sm gap-1 {data.sales.length < data.limit ? 'opacity-40 pointer-events-none' : ''}"
        onclick={nextPage}
      >Next <ChevronRight size={13} strokeWidth={2} /></button>
    </div>
  {/if}
</PageShell>
