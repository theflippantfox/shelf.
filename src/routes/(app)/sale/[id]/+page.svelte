<script lang="ts">
  import { goto } from '$app/navigation';
  import { toasts } from '$lib/stores/toast.svelte';
  import { inventory as invStore } from '$lib/stores/inventory.svelte';
  import { returns as retStore, type ReturnItem, type SaleReturn } from '$lib/stores/returns.svelte';
  import { formatCurrency, formatDateTime } from '$lib/utils/format';
  import PageShell from '$lib/components/layout/PageShell.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Sheet from '$lib/components/ui/Sheet.svelte';
  import Input from '$lib/components/ui/Input.svelte';
  import {
    ArrowLeft, Printer, Share2, RotateCcw, Check,
    AlertCircle, X, Clock, Calendar,
  } from 'lucide-svelte';

  let { data } = $props();

  // Reactive view of this sale. The store is the source of truth so
  // edits / returns anywhere flow back here.
  const sale = $derived((data.sale as any));
  const items = $derived((sale?.items ?? []) as any[]);
  const returns = $derived(retStore.for(sale?.id ?? ''));
  const returnCount = $derived(returns.length);
  const totalReturned = $derived(
    returns.reduce((s, r) => s + (r.total_refund ?? 0), 0)
  );

  // Per-product already-returned qty. Live from the store.
  const returnedQty = $derived.by(() => {
    const out: Record<string, number> = {};
    for (const r of returns) {
      for (const it of r.items ?? []) {
        out[it.product_id] = (out[it.product_id] ?? 0) + it.qty;
      }
    }
    return out;
  });

  // ── Return sheet state ─────────────────────────────────────────────
  let showReturn = $state(false);
  let saving     = $state(false);
  let returnReason = $state<'defective' | 'wrong_size' | 'changed_mind' | 'overcharge' | 'duplicate_purchase' | 'other'>('changed_mind');
  let returnMethod = $state<'cash' | 'bank' | 'credit_note' | 'none'>('cash');
  let returnNotes  = $state('');
  // Per-line return state: { [line_id]: { qty, condition } }
  // We key by line_id (sale_items.id) so editing a line doesn't mix
  // with a different line for the same product.
  type ReturnLine = { qty: number; condition: 'resellable' | 'damaged' | 'expired' };
  let returnLines: Record<string, ReturnLine> = $state({});
  // Whether each line is included in the return at all (default: false;
  // user checks the boxes for the items they want to return).
  let returnIncluded: Record<string, boolean> = $state({});

  const PAYMENT_LABEL: Record<string, string> = {
    cash: 'Cash', upi: 'UPI', card: 'Card', online: 'Online', other: 'Other', credit: 'On credit',
  };
  const REASON_LABEL: Record<string, string> = {
    defective:          'Defective product',
    wrong_size:         'Wrong size',
    changed_mind:       'Customer changed mind',
    overcharge:         'Overcharged',
    duplicate_purchase: 'Duplicate purchase',
    other:              'Other',
  };
  const CONDITION_LABEL: Record<string, string> = {
    resellable: 'Resellable',
    damaged:    'Damaged (trash)',
    expired:    'Expired',
  };
  const REFUND_LABEL: Record<string, string> = {
    cash:        'Cash',
    bank:        'UPI / Card',
    credit_note: 'Store credit',
    none:        'No refund',
  };

  // Totals
  const refundTotal = $derived(
    items
      .filter((it) => returnIncluded[it.id])
      .reduce((s, it) => s + (returnLines[it.id]?.qty ?? 0) * (it.unit_price ?? 0), 0)
  );
  const refundItemCount = $derived(
    Object.values(returnIncluded).filter(Boolean).length
  );

  function openReturnSheet() {
    // Reset the form. Default: no items included, all qty 0.
    returnReason = 'changed_mind';
    returnMethod = 'cash';
    returnNotes  = '';
    returnLines  = {};
    returnIncluded = {};
    for (const it of items) {
      returnLines[it.id] = {
        qty: 0,
        condition: 'resellable',
      };
      returnIncluded[it.id] = false;
    }
    showReturn = true;
  }

  async function submitReturn() {
    if (!sale || sale.voided_at) {
      toasts.error('Cannot return a voided sale');
      return;
    }
    const includedItems = items.filter((it) => {
      const inc = returnIncluded[it.id];
      const line = returnLines[it.id];
      return inc && line && line.qty > 0;
    });
    if (includedItems.length === 0) {
      toasts.error('Pick at least one item to return');
      return;
    }
    for (const it of includedItems) {
      const line = returnLines[it.id];
      const sold = it.qty ?? 0;
      const already = returnedQty[it.product_id] ?? 0;
      const remain = sold - already;
      if (line.qty > remain) {
        toasts.error(`Can only return ${remain} of ${it.product_name}`);
        return;
      }
      if (!['resellable','damaged','expired'].includes(line.condition)) {
        toasts.error('Pick a condition for every returned item');
        return;
      }
    }
    if (refundTotal <= 0 && returnMethod !== 'none') {
      toasts.error('Refund total is 0 — pick "No refund" instead');
      return;
    }

    saving = true;
    const clientId = crypto.randomUUID();
    const now = new Date().toISOString();
    const tempReturn: SaleReturn = {
      id:           clientId,
      client_id:    clientId,
      sale_id:      sale.id,
      shop_id:      sale.shop_id,
      processed_by: 'pending',
      reason:       returnReason,
      notes:        returnNotes || null,
      total_refund: refundTotal,
      refund_method: returnMethod,
      created_at:   now,
      items: includedItems.map((it) => ({
        id: crypto.randomUUID(),
        product_id: it.product_id,
        product_name: it.product_name,
        product_sku: it.product_sku,
        qty: returnLines[it.id].qty,
        unit_price: it.unit_price,
        line_refund: returnLines[it.id].qty * it.unit_price,
        condition: returnLines[it.id].condition,
      })),
    };
    // Optimistic: show the return immediately, then reconcile.
    retStore.add(sale.id, tempReturn);
    toasts.success(`Return recorded: ${formatCurrency(refundTotal)} ${REFUND_LABEL[returnMethod]}`);
    showReturn = false;

    try {
      const res = await fetch(`/api/sales/${sale.id}/returns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason:         returnReason,
          notes:          returnNotes || undefined,
          refund_method:  returnMethod,
          items: includedItems.map((it) => ({
            product_id: it.product_id,
            qty:         returnLines[it.id].qty,
            condition:   returnLines[it.id].condition,
          })),
        }),
      });
      const result = await res.json();
      if (!res.ok) {
        retStore.rollback(sale.id, clientId);
        toasts.error(result.error ?? 'Return failed');
        return;
      }
      // Reconcile: replace the temp return with the real one.
      const real: SaleReturn = {
        ...result.return,
        items: result.return.items,
      };
      retStore.reconcile(sale.id, clientId, real);
      // The server also restocked resellable items. Pull the latest
      // product list from the server so inventory KPIs update.
      // (Lightweight: only the affected products would be ideal, but
      // refreshing the whole list is acceptable for this volume.)
      const r = await fetch('/api/products');
      if (r.ok) {
        const products = await r.json();
        invStore.replaceAll(products);
      }
    } finally {
      saving = false;
    }
  }

  function printReceipt() {
    window.print();
  }
  // ── Share-link sheet (copies / shares the public receipt URL) ────
  let showShare = $state(false);
  let shareUrl  = $state<string | null>(null);
  let shareEnabled = $state(false);
  let sharing  = $state(false);

  async function openShare() {
    showShare = true;
    sharing = true;
    try {
      const res = await fetch(`/api/sales/${sale.id}/share`);
      if (res.ok) {
        const data = await res.json();
        shareEnabled = !!data.enabled;
        shareUrl     = data.url ?? null;
      }
    } finally {
      sharing = false;
    }
  }
  async function enableShare() {
    sharing = true;
    try {
      const res = await fetch(`/api/sales/${sale.id}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: true }),
      });
      if (res.ok) {
        const data = await res.json();
        shareEnabled = data.enabled;
        shareUrl     = data.url;
        toasts.success('Share link ready');
      } else {
        toasts.error('Could not enable sharing');
      }
    } finally {
      sharing = false;
    }
  }
  async function disableShare() {
    sharing = true;
    try {
      const res = await fetch(`/api/sales/${sale.id}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: false }),
      });
      if (res.ok) {
        const data = await res.json();
        shareEnabled = data.enabled;
        shareUrl     = data.url;
        toasts.success('Sharing disabled');
      }
    } finally {
      sharing = false;
    }
  }
  async function copyShareLink() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      toasts.success('Link copied to clipboard');
    } catch {
      // Fallback: select the input
      const el = document.getElementById('share-link-input') as HTMLInputElement | null;
      el?.select();
    }
  }
  async function nativeShare() {
    if (!shareUrl) return;
    const text = `Receipt ${sale.sale_ref} — Total: ${formatCurrency(sale.total)}`;
    if (navigator.share) {
      try { await navigator.share({ title: `Receipt ${sale.sale_ref}`, text, url: shareUrl }); }
      catch { /* user cancelled */ }
    } else {
      await copyShareLink();
    }
  }

  // ── Record-credit-payment sheet (only for credit sales) ───────────
  let showPay = $state(false);
  let payAmount = $state('');
  let payMethod = $state<'cash' | 'bank' | 'credit_note'>('cash');
  let payNotes  = $state('');
  let paying    = $state(false);

  function openRecordPayment() {
    // Pre-fill with the remaining pending amount
    const paid    = Number(sale.credit_amount_paid ?? 0);
    const total   = Number(sale.total ?? 0);
    const pending = Math.max(0, total - paid);
    payAmount = pending > 0 ? String(pending) : '';
    payMethod = 'cash';
    payNotes  = '';
    showPay   = true;
  }

  async function submitPayment() {
    const amt = parseFloat(payAmount);
    if (isNaN(amt) || amt <= 0) {
      toasts.error('Enter a valid amount');
      return;
    }
    const paid  = Number(sale.credit_amount_paid ?? 0);
    const total = Number(sale.total ?? 0);
    const due   = total - paid;
    if (amt > due + 0.005) {
      toasts.error(`Amount exceeds pending (${formatCurrency(due)})`);
      return;
    }
    paying = true;
    try {
      const res = await fetch(`/api/sales/${sale.id}/credit-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount,
          destination: payMethod,
          notes:       payNotes || undefined,
        }),
      });
      const result = await res.json();
      if (!res.ok) {
        toasts.error(result.error ?? 'Payment failed');
        return;
      }
      // Server returned the updated sale — push it into the data prop
      // by reloading the page (simplest correct way).
      toasts.success(`Payment of ${formatCurrency(amt)} recorded`);
      showPay = false;
      window.location.reload();
    } finally {
      paying = false;
    }
  }
</script>

<svelte:head><title>Receipt {sale?.sale_ref ?? ''} · Shëlf</title></svelte:head>

<PageShell title="Receipt" maxWidth="max-w-2xl">
  <button
    onclick={() => goto('/history')}
    class="text-[12px] font-semibold mb-3 inline-flex items-center gap-1 text-[var(--text-2)] hover:text-[var(--text)] no-print"
  >
    <ArrowLeft size={13} strokeWidth={2} /> Back to history
  </button>

  {#if !sale}
    <div class="surface-card p-6 text-center text-[var(--text-3)]">Sale not found</div>
  {:else}
    <!-- Receipt card -->
    <div class="surface-card p-5 md:p-6">
      <div class="flex items-start justify-between gap-3 mb-4">
        <div>
          <p class="text-[10px] font-bold uppercase tracking-wider text-[var(--text-3)]">Sale</p>
          <p class="text-[20px] font-bold tabular-nums tracking-tight">{sale.sale_ref ?? '—'}</p>
          <p class="text-[11px] text-[var(--text-3)] mt-0.5">{formatDateTime(sale.created_at)}</p>
        </div>
        <div class="flex items-center gap-1.5 no-print">
          {#if !sale.voided_at}
            <span class="badge badge-teal text-[10px]">Complete</span>
          {:else}
            <span class="badge badge-crimson text-[10px]">Voided</span>
          {/if}
          {#if sale.credit_status}
            <span class="text-[9.5px] font-bold px-1.5 py-0.5 rounded {sale.credit_status === 'paid' ? 'bg-[var(--teal)] text-[var(--teal-fg)]' : sale.credit_status === 'partial' ? 'bg-[var(--gold)] text-[var(--gold-fg)]' : 'bg-[var(--crimson)] text-white'}">
              {sale.credit_status === 'paid' ? 'Paid' : sale.credit_status === 'partial' ? 'Partial' : 'Pending'}
            </span>
          {/if}
        </div>
      </div>

      <!-- Customer / payment / served-by summary -->
      <div class="grid grid-cols-2 md:grid-cols-3 gap-2 text-[11px] mb-4">
        <div>
          <p class="text-[var(--text-3)] uppercase tracking-wider text-[9.5px] font-bold">Customer</p>
          <p class="font-semibold mt-0.5 truncate">{sale.customer?.name ?? 'Walk-in'}</p>
          {#if sale.customer?.phone}<p class="text-[var(--text-3)]">{sale.customer.phone}</p>{/if}
        </div>
        <div>
          <p class="text-[var(--text-3)] uppercase tracking-wider text-[9.5px] font-bold">Payment</p>
          <p class="font-semibold mt-0.5">{PAYMENT_LABEL[sale.payment_method] ?? sale.payment_method}</p>
        </div>
        <div>
          <p class="text-[var(--text-3)] uppercase tracking-wider text-[9.5px] font-bold">Served by</p>
          <p class="font-semibold mt-0.5 truncate">
            {sale.served_by ? `${sale.served_by.first_name ?? ''} ${sale.served_by.last_name ?? ''}`.trim() || '—' : '—'}
          </p>
        </div>
      </div>

      <!-- Credit & balance panel — only for credit sales. -->
      {#if sale.payment_method === 'credit' && !sale.voided_at}
        {@const paid     = Number(sale.credit_amount_paid ?? 0)}
        {@const total    = Number(sale.total ?? 0)}
        {@const pending  = Math.max(0, total - paid)}
        {@const pctPaid  = total > 0 ? Math.min(100, (paid / total) * 100) : 0}
        {@const status   = sale.credit_status ?? (pending <= 0.005 ? 'paid' : paid <= 0.005 ? 'pending' : 'partial')}
        <div class="rounded-xl p-4 mb-4 space-y-3"
             style="background:color-mix(in srgb, {status === 'paid' ? 'var(--teal)' : status === 'partial' ? 'var(--gold)' : 'var(--crimson)'} 8%, var(--surface)); border:1px solid color-mix(in srgb, {status === 'paid' ? 'var(--teal)' : status === 'partial' ? 'var(--gold)' : 'var(--crimson)'} 28%, transparent);">
          <!-- Header row: status + due date -->
          <div class="flex items-center justify-between gap-2 flex-wrap">
            <div class="flex items-center gap-2">
              <Clock size={14} strokeWidth={2.2}
                     style="color:{status === 'paid' ? 'var(--teal-fg)' : status === 'partial' ? 'var(--gold-fg)' : 'var(--crimson-fg)'}" />
              <p class="text-[11px] font-bold uppercase tracking-wider"
                 style="color:{status === 'paid' ? 'var(--teal-fg)' : status === 'partial' ? 'var(--gold-fg)' : 'var(--crimson-fg)'}">
                {status === 'paid' ? 'Paid in full' : status === 'partial' ? 'Partial payment' : 'Pending payment'}
              </p>
            </div>
            {#if sale.credit_due_date}
              <p class="text-[11px] text-[var(--text-3)] flex items-center gap-1">
                <Calendar size={11} strokeWidth={2} />
                Due by {new Date(sale.credit_due_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
              </p>
            {/if}
          </div>

          <!-- Progress bar: how much of the bill is paid -->
          <div>
            <div class="flex justify-between text-[10.5px] mb-1.5">
              <span class="text-[var(--text-3)]">Paid</span>
              <span class="font-semibold tabular-nums text-[var(--text-2)]">
                {formatCurrency(paid)} / {formatCurrency(total)}
              </span>
            </div>
            <div class="h-2 rounded-full overflow-hidden" style="background:var(--surface2)">
              <div class="h-full rounded-full transition-all"
                   style="width: {pctPaid}%; background: {status === 'paid' ? 'var(--teal)' : 'var(--gold)'}"></div>
            </div>
          </div>

          <!-- Paid / Pending tiles -->
          <div class="grid grid-cols-2 gap-2">
            <div class="rounded-lg p-2.5"
                 style="background:color-mix(in srgb, var(--teal) 12%, var(--surface))">
              <p class="text-[9px] font-bold uppercase tracking-wider" style="color:var(--teal-fg)">Paid</p>
              <p class="text-[16px] font-bold tabular-nums mt-0.5" style="color:var(--teal-fg)">
                {formatCurrency(paid)}
              </p>
            </div>
            <div class="rounded-lg p-2.5"
                 style="background:color-mix(in srgb, {pending > 0 ? 'var(--crimson)' : 'var(--teal)'} 12%, var(--surface))">
              <p class="text-[9px] font-bold uppercase tracking-wider"
                 style="color:{pending > 0 ? 'var(--crimson-fg)' : 'var(--teal-fg)'}">
                {pending > 0 ? 'Pending' : 'Settled'}
              </p>
              <p class="text-[16px] font-bold tabular-nums mt-0.5"
                 style="color:{pending > 0 ? 'var(--crimson-fg)' : 'var(--teal-fg)'}">
                {formatCurrency(pending)}
              </p>
            </div>
          </div>

          <!-- Notes (if any) -->
          {#if sale.notes}
            <div class="rounded-lg p-2.5 text-[11.5px] italic text-[var(--text-2)]"
                 style="background:var(--surface)">
              <p class="text-[9px] not-italic font-bold uppercase tracking-wider text-[var(--text-3)] mb-0.5">Note</p>
              "{sale.notes}"
            </div>
          {/if}

          <!-- Action: record a credit payment (cashier marks more paid) -->
          {#if status !== 'paid' && sale.customer_id}
            <div class="flex justify-end pt-1">
              <Button size="sm" variant="secondary" onclick={openRecordPayment}>
                <Check size={12} strokeWidth={2.2} /> Record payment
              </Button>
            </div>
          {/if}
        </div>
      {/if}

      <!-- Items -->
      <div class="border-t border-[var(--border)] pt-3">
        <p class="text-[10px] font-bold uppercase tracking-wider text-[var(--text-3)] mb-2">Items</p>
        <div class="divide-y divide-[var(--border)]">
          {#each items as it (it.id)}
            {@const already = returnedQty[it.product_id] ?? 0}
            {@const remain = (it.qty ?? 0) - already}
            <div class="py-2 flex items-start gap-3">
              <div class="flex-1 min-w-0">
                <p class="text-[13px] font-semibold truncate">{it.product_name}</p>
                {#if it.product_sku}<p class="text-[10px] text-[var(--text-3)] font-mono">{it.product_sku}</p>{/if}
                <p class="text-[10.5px] text-[var(--text-3)] tabular-nums">
                  {formatCurrency(it.unit_price)} × {it.qty}
                  {#if already > 0}
                    <span class="text-[var(--crimson-fg)]">· {already} returned</span>
                  {/if}
                </p>
              </div>
              <p class="text-[13px] font-bold tabular-nums shrink-0">{formatCurrency(it.line_total)}</p>
            </div>
          {/each}
        </div>
      </div>

      <!-- Totals -->
      <div class="border-t border-[var(--border)] pt-3 mt-2 space-y-1 text-[12px]">
        <div class="flex justify-between">
          <span class="text-[var(--text-3)]">Subtotal</span>
          <span class="tabular-nums">{formatCurrency(sale.subtotal)}</span>
        </div>
        {#if sale.discount_amount > 0}
          <div class="flex justify-between" style="color:var(--teal-fg)">
            <span>Discount</span>
            <span class="tabular-nums">– {formatCurrency(sale.discount_amount)}</span>
          </div>
        {/if}
        {#if sale.tax_amount > 0}
          <div class="flex justify-between">
            <span class="text-[var(--text-3)]">Tax</span>
            <span class="tabular-nums">{formatCurrency(sale.tax_amount)}</span>
          </div>
        {/if}
        {#if totalReturned > 0}
          <div class="flex justify-between" style="color:var(--crimson-fg)">
            <span>Refunded</span>
            <span class="tabular-nums">– {formatCurrency(totalReturned)}</span>
          </div>
        {/if}
        <div class="flex justify-between font-bold text-[15px] pt-1.5 border-t border-[var(--border)] mt-1">
          <span>Total</span>
          <span class="tabular-nums">{formatCurrency(sale.total)}</span>
        </div>
      </div>

      <!-- Action row -->
      {#if !sale.voided_at}
        <div class="flex gap-2 mt-4 no-print">
          <Button variant="primary" onclick={openReturnSheet} class="flex-1" disabled={sale.voided_at}>
            <RotateCcw size={14} strokeWidth={2} /> Process return
          </Button>
          <Button variant="secondary" onclick={printReceipt}>
            <Printer size={14} strokeWidth={2} /> Print
          </Button>
          <Button variant="secondary" onclick={openShare}>
            <Share2 size={14} strokeWidth={2} /> Share
          </Button>
        </div>
      {/if}
    </div>

    <!-- Returns history -->
    {#if returnCount > 0}
      <div class="surface-card p-5 mt-3 no-print">
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center gap-2">
            <RotateCcw size={14} strokeWidth={2.2} style="color:var(--crimson)" />
            <h2 class="font-semibold text-[14px]">Returns</h2>
            <span class="text-[10px] text-[var(--text-3)] font-semibold uppercase tracking-wider">· {returnCount} processed</span>
          </div>
          <span class="text-[12px] font-bold tabular-nums" style="color:var(--crimson-fg)">
            –{formatCurrency(totalReturned)}
          </span>
        </div>
        <div class="space-y-2.5">
          {#each returns as r (r.id)}
            <div class="rounded-lg p-3" style="background:var(--surface2)">
              <div class="flex items-center justify-between gap-2 mb-1.5">
                <div>
                  <p class="text-[12px] font-semibold">{REASON_LABEL[r.reason] ?? r.reason}</p>
                  <p class="text-[10.5px] text-[var(--text-3)]">
                    {formatDateTime(r.created_at)} · {REFUND_LABEL[r.refund_method] ?? r.refund_method}
                  </p>
                </div>
                <p class="text-[12.5px] font-bold tabular-nums" style="color:var(--crimson-fg)">
                  –{formatCurrency(r.total_refund)}
                </p>
              </div>
              {#if r.notes}
                <p class="text-[11px] text-[var(--text-2)] italic mb-1.5">"{r.notes}"</p>
              {/if}
              <div class="flex flex-wrap gap-1.5">
                {#each r.items as it}
                  <span class="text-[10px] px-1.5 py-0.5 rounded-md"
                        style="background:color-mix(in srgb, {it.condition === 'resellable' ? 'var(--teal)' : it.condition === 'expired' ? 'var(--gold)' : 'var(--crimson)'} 12%, var(--surface)); color:var(--text-2);">
                    {it.qty}× {it.product_name}
                    <span class="text-[var(--text-3)]">· {CONDITION_LABEL[it.condition]}</span>
                  </span>
                {/each}
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}
  {/if}
</PageShell>

<!-- ──────────────────────────────────────────────────────────────────────
  RETURN SHEET
  Bottom-anchored sheet that lets the cashier pick which items were
  returned, how many of each, what condition they're in (resellable
  / damaged / expired), and how the customer is being refunded
  (cash / bank / store credit / no refund).
  ────────────────────────────────────────────────────────────────────── -->
<Sheet bind:open={showReturn} title="Process return" maxWidth="max-w-md">
  <div class="space-y-4">
    <div class="rounded-xl p-3 flex items-start gap-2.5"
         style="background:color-mix(in srgb, var(--crimson) 8%, var(--surface)); border:1px solid color-mix(in srgb, var(--crimson) 22%, transparent);">
      <AlertCircle size={14} strokeWidth={2.2} class="mt-0.5 shrink-0" style="color:var(--crimson)" />
      <p class="text-[11.5px] leading-relaxed" style="color:var(--text-2)">
        Returns are <strong>separate events</strong> — the original sale stays
        in the record. Stock is restocked for resellable items,
        money flows back out for cash / bank refunds, and the
        customer balance is adjusted for credit notes.
      </p>
    </div>

    <!-- Reason -->
    <div>
      <p class="input-label mb-1.5">Reason</p>
      <div class="grid grid-cols-2 gap-1.5">
        {#each Object.entries(REASON_LABEL) as [val, label]}
          <button type="button"
                  class="px-2 py-1.5 text-[11px] font-semibold rounded-md border transition
                         {returnReason === val
                           ? 'shadow-sm'
                           : 'border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface2)] text-[var(--text-2)]'}"
                  style={returnReason === val
                    ? 'border-color:var(--crimson); background:color-mix(in srgb, var(--crimson) 10%, transparent); color:var(--crimson-fg);'
                    : ''}
                  onclick={() => returnReason = val}>
            {label}
          </button>
        {/each}
      </div>
    </div>

    <!-- Items: checkbox + qty + condition per line -->
    <div>
      <p class="input-label mb-1.5">Items being returned</p>
      <div class="space-y-1.5">
        {#each items as it (it.id)}
          {@const already = returnedQty[it.product_id] ?? 0}
          {@const remain = (it.qty ?? 0) - already}
          {@const inc = returnIncluded[it.id] ?? false}
          {@const line = returnLines[it.id] ?? { qty: 0, condition: 'resellable' }}
          <div class="rounded-lg p-2.5 border"
               style={inc
                 ? 'border-color:var(--crimson); background:color-mix(in srgb, var(--crimson) 4%, var(--surface));'
                 : 'border-color:var(--border); background:var(--surface2);'}>
            <div class="flex items-start gap-2">
              <input
                type="checkbox"
                class="mt-0.5"
                checked={inc}
                onchange={(e) => {
                  returnIncluded[it.id] = (e.currentTarget as HTMLInputElement).checked;
                  if (returnIncluded[it.id] && (returnLines[it.id]?.qty ?? 0) === 0) {
                    returnLines[it.id] = { ...returnLines[it.id], qty: remain };
                  }
                }}
                disabled={remain <= 0}
              />
              <div class="flex-1 min-w-0">
                <p class="text-[12.5px] font-semibold truncate">{it.product_name}</p>
                <p class="text-[10px] text-[var(--text-3)] tabular-nums">
                  sold {it.qty}
                  {#if already > 0} · {already} already returned{/if}
                  {#if remain <= 0} · fully returned{/if}
                </p>
              </div>
            </div>
            {#if inc}
              <div class="flex items-center gap-2 mt-2 ml-5">
                <div class="flex items-center gap-1">
                  <button type="button" class="btn btn-ghost btn-icon btn-sm"
                          onclick={() => returnLines[it.id] = { ...line, qty: Math.max(0, line.qty - 1) }}>
                    <X size={11} />
                  </button>
                  <input
                    type="number"
                    class="input w-14 text-center text-[12px] tabular-nums"
                    min="1"
                    max={remain}
                    bind:value={returnLines[it.id].qty}
                  />
                  <button type="button" class="btn btn-ghost btn-icon btn-sm"
                          onclick={() => returnLines[it.id] = { ...line, qty: Math.min(remain, line.qty + 1) }}>
                    +
                  </button>
                </div>
                <select
                  class="input text-[11px] py-1 flex-1"
                  bind:value={returnLines[it.id].condition}
                >
                  <option value="resellable">Resellable</option>
                  <option value="damaged">Damaged (trash)</option>
                  <option value="expired">Expired</option>
                </select>
              </div>
            {/if}
          </div>
        {/each}
      </div>
    </div>

    <!-- Refund method -->
    <div>
      <p class="input-label mb-1.5">Refund method</p>
      <div class="grid grid-cols-4 gap-1.5">
        {#each Object.entries(REFUND_LABEL) as [val, label]}
          <button type="button"
                  class="px-2 py-2 text-[10.5px] font-semibold rounded-md border transition
                         {returnMethod === val
                           ? 'shadow-sm'
                           : 'border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface2)] text-[var(--text-2)]'}"
                  style={returnMethod === val
                    ? 'border-color:var(--primary); background:color-mix(in srgb, var(--primary) 10%, transparent); color:var(--primary-fg);'
                    : ''}
                  onclick={() => returnMethod = val}>
            {label}
          </button>
        {/each}
      </div>
    </div>

    <!-- Notes -->
    <div>
      <p class="input-label mb-1.5">Notes <span class="text-[var(--text-3)] font-normal">(optional)</span></p>
      <textarea
        bind:value={returnNotes}
        placeholder="Any context the audit trail should capture…"
        rows="2"
        class="input text-sm resize-y min-h-[56px]"
      ></textarea>
    </div>

    <!-- Live summary -->
    <div class="rounded-lg p-3 flex items-center justify-between"
         style="background:var(--surface2)">
      <div>
        <p class="text-[9.5px] font-bold uppercase tracking-wider text-[var(--text-3)]">Refund</p>
        <p class="text-[18px] font-bold tabular-nums mt-0.5" style={refundTotal > 0 ? 'color:var(--crimson-fg)' : ''}>
          {formatCurrency(refundTotal)}
        </p>
        <p class="text-[10.5px] text-[var(--text-3)]">
          {refundItemCount} item{refundItemCount === 1 ? '' : 's'} via {REFUND_LABEL[returnMethod]}
        </p>
      </div>
    </div>
  </div>

  {#snippet footer()}
    <div class="flex gap-2">
      <Button variant="secondary" onclick={() => (showReturn = false)} class="flex-1">Cancel</Button>
      <Button variant="primary" onclick={submitReturn} loading={saving} class="flex-1">
        <Check size={14} strokeWidth={2.2} /> Record return
      </Button>
    </div>
  {/snippet}
</Sheet>

<!-- ──────────────────────────────────────────────────────────────────────
  SHARE-LINK SHEET
  Triggered by the "Share" button. Mints a public, unauthenticated
  link to a slimmed-down version of the receipt (no cost prices, no
  internal notes, no returns history). The link can be disabled at
  any time, which also rotates the token.
  ────────────────────────────────────────────────────────────────────── -->
<Sheet bind:open={showShare} title="Share receipt" maxWidth="max-w-md">
  <div class="space-y-4">
    <div class="rounded-xl p-3 flex items-start gap-2.5"
         style="background:color-mix(in srgb, var(--primary) 8%, var(--surface)); border:1px solid color-mix(in srgb, var(--primary) 22%, transparent);">
      <Share2 size={14} strokeWidth={2.2} class="mt-0.5 shrink-0" style="color:var(--primary)" />
      <div class="text-[11.5px] leading-relaxed" style="color:var(--text-2)">
        <p>
          Anyone with the link can view this receipt. It shows items, totals, and
          payment method — <strong>not</strong> cost prices, profit, internal
          notes, or your customer's contact details.
        </p>
        <p class="text-[10.5px] text-[var(--text-3)] mt-1.5">
          You can disable sharing at any time, which also invalidates the link.
        </p>
      </div>
    </div>

    {#if sharing}
      <div class="h-24 flex items-center justify-center text-[var(--text-3)] text-[12px]">
        Loading…
      </div>
    {:else if !shareEnabled}
      <div class="rounded-xl p-6 text-center" style="background:var(--surface2)">
        <Share2 size={28} strokeWidth={1.5} class="mx-auto mb-2" style="color:var(--text-3)" />
        <p class="text-[12.5px] font-semibold mb-1">Sharing is off</p>
        <p class="text-[11px] text-[var(--text-3)] mb-3">
          Generate a link to share this receipt with the customer.
        </p>
        <Button variant="primary" onclick={enableShare} loading={sharing}>
          <Share2 size={14} strokeWidth={2} /> Generate link
        </Button>
      </div>
    {:else if shareUrl}
      <div>
        <p class="input-label mb-1.5">Public link</p>
        <div class="flex gap-1.5">
          <input
            id="share-link-input"
            type="text"
            readonly
            value={shareUrl}
            class="input flex-1 text-[12px] font-mono truncate"
            onclick={(e) => (e.currentTarget as HTMLInputElement).select()}
          />
          <Button variant="secondary" onclick={copyShareLink} size="sm">
            Copy
          </Button>
        </div>
      </div>

      <div class="rounded-xl p-3 text-[11.5px] text-[var(--text-2)]"
           style="background:var(--surface2)">
        <p class="font-semibold text-[var(--text)] mb-1">What they see</p>
        <ul class="space-y-0.5 list-disc pl-4">
          <li>Receipt reference, date, items + line totals</li>
          <li>Subtotal, discount, tax, total</li>
          <li>Payment method + the public note (if you set one)</li>
          <li>A "voided" banner if the sale is later voided</li>
        </ul>
        <p class="text-[10.5px] text-[var(--text-3)] mt-2 italic">
          They do <strong>not</strong> see cost prices, profit, returns history,
          or your customer's phone / email.
        </p>
      </div>

      <div class="flex gap-2">
        <Button variant="secondary" onclick={disableShare} loading={sharing} class="flex-1">
          Disable link
        </Button>
        <Button variant="primary" onclick={nativeShare} class="flex-1">
          <Share2 size={14} strokeWidth={2} /> Share
        </Button>
      </div>
    {/if}
  </div>
</Sheet>

<!-- ──────────────────────────────────────────────────────────────────────
  RECORD-CREDIT-PAYMENT SHEET
  Triggered by the "Record payment" button on the credit & balance
  panel. Lets the cashier record an incoming payment against the
  customer's outstanding balance. Pre-fills the amount with the
  remaining pending.
  ────────────────────────────────────────────────────────────────────── -->
<Sheet bind:open={showPay} title="Record credit payment" maxWidth="max-w-md">
  <div class="space-y-4">
    <div class="rounded-xl p-3 space-y-1.5" style="background:var(--surface2)">
      <div class="flex justify-between text-[11.5px]">
        <span class="text-[var(--text-3)]">Total bill</span>
        <span class="font-semibold tabular-nums">{formatCurrency(sale?.total ?? 0)}</span>
      </div>
      <div class="flex justify-between text-[11.5px]">
        <span class="text-[var(--text-3)]">Already paid</span>
        <span class="font-semibold tabular-nums" style="color:var(--teal-fg)">
          {formatCurrency(sale?.credit_amount_paid ?? 0)}
        </span>
      </div>
      <div class="flex justify-between text-[12.5px] font-bold border-t border-[var(--border)] pt-1.5 mt-1.5">
        <span>Pending</span>
        <span class="tabular-nums" style="color:var(--crimson-fg)">
          {formatCurrency(Math.max(0, (sale?.total ?? 0) - (sale?.credit_amount_paid ?? 0)))}
        </span>
      </div>
    </div>

    <!-- Method: cash / UPI-bank / store credit note -->
    <div>
      <p class="input-label mb-1.5">Received via</p>
      <div class="grid grid-cols-3 gap-1.5">
        {#each [['cash','Cash','var(--teal)'],['bank','UPI / Card','var(--primary)'],['credit_note','Store credit','var(--gold)']] as [val, label, color]}
          <button type="button"
                  class="px-2 py-2 text-[10.5px] font-semibold rounded-md border transition
                         {payMethod === val
                           ? 'shadow-sm'
                           : 'border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface2)] text-[var(--text-2)]'}"
                  style={payMethod === val
                    ? `border-color:${color}; background:color-mix(in srgb, ${color} 10%, transparent); color:${color};`
                    : ''}
                  onclick={() => payMethod = val}>
            {label}
          </button>
        {/each}
      </div>
    </div>

    <!-- Amount -->
    <div>
      <p class="input-label mb-1.5">Amount received now</p>
      <Input type="number" step="0.01" min="0.01"
             max={Math.max(0, (sale?.total ?? 0) - (sale?.credit_amount_paid ?? 0))}
             bind:value={payAmount} />
    </div>

    <!-- Notes -->
    <div>
      <p class="input-label mb-1.5">Notes <span class="text-[var(--text-3)] font-normal">(optional)</span></p>
      <textarea
        bind:value={payNotes}
        rows="2"
        placeholder="e.g. paid via GPay, customer promised rest by Friday…"
        class="input text-sm resize-y min-h-[56px]"
      ></textarea>
    </div>
  </div>

  {#snippet footer()}
    <div class="flex gap-2">
      <Button variant="secondary" onclick={() => (showPay = false)} class="flex-1">Cancel</Button>
      <Button variant="primary" onclick={submitPayment} loading={paying} class="flex-1">
        <Check size={14} strokeWidth={2.2} /> Record payment
      </Button>
    </div>
  {/snippet}
</Sheet>

<style>
  /* Hide the action row + return history when printing */
  @media print {
    .no-print { display: none !important; }
  }
</style>
