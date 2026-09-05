<script lang="ts">
  import { formatCurrency } from '$lib/utils/format';
  import { Store, Calendar } from 'lucide-svelte';

  let { data } = $props();

  const PAYMENT_LABEL: Record<string, string> = {
    cash: 'Cash', upi: 'UPI', card: 'Card', online: 'Online', other: 'Other', credit: 'On credit',
  };

  const sale  = $derived((data.sale as any));
  const items = $derived((data.items as any[]) ?? []);
</script>

<svelte:head>
  <title>Receipt {sale?.sale_ref ?? ''} · Shëlf</title>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="min-h-screen flex items-start justify-center p-4 md:p-8"
     style="background:var(--bg);">
  <div class="surface-card w-full max-w-md p-5 md:p-6">
    <!-- Header: Store icon + receipt ref -->
    <div class="flex items-start justify-between gap-3 mb-4">
      <div>
        <p class="text-[10px] font-bold uppercase tracking-wider text-[var(--text-3)]">Receipt</p>
        <p class="text-[20px] font-bold tabular-nums tracking-tight">{sale?.sale_ref ?? '—'}</p>
        <p class="text-[11px] text-[var(--text-3)] mt-0.5">
          {new Date(sale?.created_at).toLocaleString('en-IN', {
            day: 'numeric', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
          })}
        </p>
      </div>
      <div class="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
           style="background:color-mix(in srgb, var(--primary) 14%, transparent)">
        <Store size={18} strokeWidth={2} style="color:var(--primary)" />
      </div>
    </div>

    {#if data.isVoided}
      <div class="rounded-lg p-3 mb-4 text-[12px] font-semibold text-center"
           style="background:color-mix(in srgb, var(--crimson) 12%, var(--surface)); color:var(--crimson-fg);">
        This receipt was voided. The sale is no longer valid.
      </div>
    {/if}

    <!-- Items -->
    <div class="border-t border-[var(--border)] pt-3">
      <p class="text-[10px] font-bold uppercase tracking-wider text-[var(--text-3)] mb-2">Items</p>
      <div class="divide-y divide-[var(--border)]">
        {#each items as it}
          <div class="py-2 flex items-start gap-3">
            <div class="flex-1 min-w-0">
              <p class="text-[13px] font-semibold truncate">{it.product_name}</p>
              {#if it.product_sku}<p class="text-[10px] text-[var(--text-3)] font-mono">{it.product_sku}</p>{/if}
              <p class="text-[10.5px] text-[var(--text-3)] tabular-nums">
                {formatCurrency(it.unit_price)} × {it.qty}
              </p>
            </div>
            <p class="text-[13px] font-bold tabular-nums shrink-0">{formatCurrency(it.line_total)}</p>
          </div>
        {/each}
      </div>
    </div>

    <!-- Totals (NO cost prices, NO profit, NO internal markup) -->
    <div class="border-t border-[var(--border)] pt-3 mt-2 space-y-1 text-[12px]">
      <div class="flex justify-between">
        <span class="text-[var(--text-3)]">Subtotal</span>
        <span class="tabular-nums">{formatCurrency(sale?.subtotal ?? 0)}</span>
      </div>
      {#if sale?.discount_amount > 0}
        <div class="flex justify-between" style="color:var(--teal-fg)">
          <span>Discount</span>
          <span class="tabular-nums">– {formatCurrency(sale.discount_amount)}</span>
        </div>
      {/if}
      {#if sale?.tax_amount > 0}
        <div class="flex justify-between">
          <span class="text-[var(--text-3)]">Tax</span>
          <span class="tabular-nums">{formatCurrency(sale.tax_amount)}</span>
        </div>
      {/if}
      <div class="flex justify-between font-bold text-[15px] pt-1.5 border-t border-[var(--border)] mt-1">
        <span>Total</span>
        <span class="tabular-nums">{formatCurrency(sale?.total ?? 0)}</span>
      </div>
      <div class="flex items-center gap-1.5 pt-2 text-[var(--text-3)]">
        <Calendar size={11} strokeWidth={2} />
        <span class="text-[11px]">Paid via {PAYMENT_LABEL[sale?.payment_method] ?? sale?.payment_method}</span>
      </div>
    </div>

    {#if sale?.notes}
      <div class="rounded-lg p-3 mt-3 text-[11.5px] italic text-[var(--text-2)]"
           style="background:var(--surface2)">
        {sale.notes}
      </div>
    {/if}

    <!-- Footer: brand + disclaimer -->
    <div class="border-t border-[var(--border)] mt-5 pt-3 text-center">
      <p class="text-[10px] text-[var(--text-3)] uppercase tracking-wider font-bold">Shëlf</p>
      <p class="text-[10px] text-[var(--text-3)] mt-0.5">
        Receipt shared from a Shëlf shop. Public link.
      </p>
    </div>
  </div>
</div>
