<script lang="ts">
  import { formatCurrency } from '$lib/utils/format';

  let { data } = $props();

  const PAYMENT_LABEL: Record<string, string> = {
    cash: 'Cash', upi: 'UPI', card: 'Card', online: 'Online', other: 'Other', credit: 'On credit',
  };

  const sale  = $derived((data.sale as any));
  const items = $derived((data.items as any[]) ?? []);

  const pendingAmount = $derived(
    sale?.payment_method === 'credit'
      ? Math.max(0, (sale?.total ?? 0) - (sale?.credit_amount_paid ?? 0))
      : 0
  );
</script>

<svelte:head>
  <title>Receipt {sale?.sale_ref ?? ''} · Shëlf</title>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="min-h-screen flex items-center justify-center p-4 md:p-8"
     style="background:var(--bg);">
  <!--
    Layout:
      - max-w-sm (narrow receipt card, like a thermal print)
      - mx-auto (horizontally centered)
      - All sections stacked vertically with clear visual separators
  -->
  <div class="surface-card w-full max-w-sm mx-auto p-5">

    <!-- ── Header: Shop name + Receipt ref + date ──────────────────── -->
    <div class="text-center mb-4">
      {#if data.shopName}
        <p class="text-[18px] font-bold mb-1" style="color:var(--primary)">{data.shopName}</p>
      {/if}
      <p class="text-[10px] font-bold uppercase tracking-widest text-[var(--text-3)]">Receipt</p>
      <p class="text-[13px] font-semibold tabular-nums tracking-tight mt-0.5">{sale?.sale_ref ?? '—'}</p>
      <p class="text-[11px] text-[var(--text-3)] mt-0.5">
        {new Date(sale?.created_at).toLocaleString('en-IN', {
          day: 'numeric', month: 'short', year: 'numeric',
          hour: '2-digit', minute: '2-digit'
        })}
      </p>
      {#if sale?.customer_name}
        <p class="text-[11.5px] font-semibold mt-1" style="color:var(--primary)">
          {sale.customer_name}
        </p>
      {/if}
    </div>

    {#if data.isVoided}
      <div class="rounded-lg p-3 mb-4 text-[12px] font-semibold text-center"
           style="background:color-mix(in srgb, var(--crimson) 12%, var(--surface)); color:var(--crimson-fg);">
        This receipt was voided. The sale is no longer valid.
      </div>
    {/if}

    <!-- ── Items: name · qty @ price    line_total ─────────── -->
    <div class="border-t border-[var(--border)] pt-3 mb-3">
      {#each items as it}
        <div class="flex items-baseline justify-between gap-2 py-1.5">
          <!-- Name · qty @ unit_price -->
          <div class="flex-1 min-w-0">
            <p class="text-[12.5px] font-medium truncate">{it.product_name}</p>
            <p class="text-[10.5px] text-[var(--text-3)] tabular-nums">
              {it.qty} × {formatCurrency(it.unit_price)}
            </p>
          </div>
          <!-- Line total — right aligned -->
          <p class="text-[12.5px] font-bold tabular-nums shrink-0">
            {formatCurrency(it.line_total)}
          </p>
        </div>
      {/each}
    </div>

    <!-- ── Totals: subtotal → discount → tax → total ─────────── -->
    <div class="border-t border-[var(--border)] pt-3 space-y-1 text-[12px]">

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

      <!-- Total — emphasized -->
      <div class="flex justify-between font-bold text-[15px] pt-1.5 border-t border-[var(--border)] mt-1.5">
        <span>Total</span>
        <span class="tabular-nums" style="color:var(--primary)">{formatCurrency(sale?.total ?? 0)}</span>
      </div>

      <!-- Payment method -->
      <div class="flex justify-between text-[var(--text-3)] pt-1">
        <span>Paid via</span>
        <span class="font-medium">{PAYMENT_LABEL[sale?.payment_method] ?? sale?.payment_method}</span>
      </div>

      <!-- Credit breakdown — only shown for credit sales -->
      {#if sale?.payment_method === 'credit' && !data.isVoided}
        <div class="rounded-lg p-2.5 mt-2 space-y-1.5"
             style="background:var(--gold-dim); border:1px solid color-mix(in srgb, var(--gold) 25%, transparent);">
          <p class="text-[10px] font-bold uppercase tracking-wider mb-1.5" style="color:var(--gold-fg)">
            Credit — {sale.credit_status === 'paid' ? 'Paid in full' : sale.credit_status === 'partial' ? 'Partial payment' : 'Pending'}
          </p>

          <div class="flex justify-between text-[11.5px]">
            <span style="color:var(--gold-fg)">Received</span>
            <span class="tabular-nums font-semibold" style="color:var(--teal-fg)">
              {formatCurrency(sale.credit_amount_paid ?? 0)}
            </span>
          </div>

          {#if pendingAmount > 0.005}
            <div class="flex justify-between text-[11.5px]">
              <span style="color:var(--gold-fg)">Pending</span>
              <span class="tabular-nums font-semibold" style="color:var(--crimson-fg)">
                {formatCurrency(pendingAmount)}
              </span>
            </div>
          {/if}

          {#if sale?.credit_due_date}
            <p class="text-[10.5px] pt-0.5" style="color:var(--gold-fg)">
              Due: {new Date(sale.credit_due_date).toLocaleDateString('en-IN', {
                day: 'numeric', month: 'short', year: 'numeric'
              })}
            </p>
          {/if}
        </div>
      {/if}
    </div>

    <!-- ── Notes ───────────────────────────────────────────────── -->
    {#if sale?.notes}
      <div class="rounded-lg p-3 mt-3 text-[11.5px] italic text-[var(--text-2)]"
           style="background:var(--surface2)">
        {sale.notes}
      </div>
    {/if}

    <!-- ── Footer: brand ─────────────────────────────────────── -->
    <div class="border-t border-[var(--border)] mt-5 pt-3 text-center">
      <p class="text-[10px] font-bold uppercase tracking-widest text-[var(--text-3)]">Shëlf</p>
      <p class="text-[10px] text-[var(--text-3)] mt-0.5">
        Receipt shared from Shëlf
      </p>
    </div>
  </div>
</div>
