<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  import { formatCurrency, formatDateTime } from '$lib/utils/format';
  import { auth } from '$lib/stores/auth.svelte';
  import { toasts } from '$lib/stores/toast.svelte';
  import PageShell from '$lib/components/layout/PageShell.svelte';
  import Button    from '$lib/components/ui/Button.svelte';
  import Modal     from '$lib/components/ui/Modal.svelte';
  import Input     from '$lib/components/ui/Input.svelte';
  import { ArrowLeft, Ban } from 'lucide-svelte';

  let { data } = $props();
  const s = $derived(data.sale as any);
  const items = $derived(data.items as any[]);

  let showVoid    = $state(false);
  let voidReason  = $state('');
  let voiding     = $state(false);

  async function doVoid() {
    voiding = true;
    const res = await fetch(`/api/sales/${s.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ void_reason: voidReason }),
    });
    if (res.ok) {
      toasts.success('Sale voided and stock restored');
      showVoid = false;
      await invalidateAll();
    } else toasts.error('Void failed');
    voiding = false;
  }
</script>

<svelte:head><title>Sale {s.sale_ref} · Shëlf</title></svelte:head>

<PageShell>
  <div class="flex items-center gap-3 mb-5">
    <button class="btn btn-ghost btn-icon" onclick={() => goto('/history')}>
      <ArrowLeft size={16} strokeWidth={1.75} />
    </button>
    <div class="flex-1">
      <p class="font-semibold text-sm">{s.sale_ref}</p>
      <p class="text-xs text-[var(--text-3)]">{formatDateTime(s.date_created)}</p>
    </div>
    {#if !s.voided_at && auth.can('sales.void')}
      <Button variant="danger" size="sm" onclick={() => showVoid = true}>
        <Ban size={13} strokeWidth={1.75} /> Void
      </Button>
    {/if}
    {#if s.voided_at}
      <span class="badge badge-crimson">Voided</span>
    {/if}
  </div>

  <!-- Line items -->
  <div class="card overflow-hidden mb-4">
    <table class="tbl">
      <thead><tr><th>Item</th><th>Qty</th><th>Unit price</th><th>Total</th></tr></thead>
      <tbody>
        {#each items as item}
          <tr>
            <td>
              <p class="text-xs font-semibold">{item.product_name}</p>
              <p class="text-[10px] text-[var(--text-3)]">{item.product_sku}</p>
            </td>
            <td class="text-xs">{item.qty}</td>
            <td class="text-xs">{formatCurrency(item.unit_price)}</td>
            <td class="text-xs font-semibold">{formatCurrency(item.line_total)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <!-- Summary -->
  <div class="card p-4 mb-4">
    <div class="flex flex-col gap-1.5 text-xs">
      <div class="flex justify-between"><span class="text-[var(--text-3)]">Subtotal</span><span>{formatCurrency(s.subtotal)}</span></div>
      {#if s.discount_amount > 0}
        <div class="flex justify-between text-[var(--teal-fg)]"><span>Discount</span><span>– {formatCurrency(s.discount_amount)}</span></div>
      {/if}
      {#if s.tax_amount > 0}
        <div class="flex justify-between text-[var(--text-3)]"><span>Tax</span><span>{formatCurrency(s.tax_amount)}</span></div>
      {/if}
      <div class="flex justify-between font-semibold text-sm border-t border-[var(--border)] pt-2 mt-1">
        <span>Total</span><span>{formatCurrency(s.total)}</span>
      </div>
    </div>
  </div>

  <!-- Meta -->
  <div class="card p-4 text-xs flex flex-col gap-2">
    <div class="flex justify-between"><span class="text-[var(--text-3)]">Customer</span><span>{s.customer?.name ?? 'Walk-in'}</span></div>
    <div class="flex justify-between"><span class="text-[var(--text-3)]">Payment</span><span class="capitalize">{s.payment_method}</span></div>
    <div class="flex justify-between"><span class="text-[var(--text-3)]">Served by</span>
      <span>{s.served_by?.first_name} {s.served_by?.last_name}</span></div>
    {#if s.notes}<div class="flex justify-between"><span class="text-[var(--text-3)]">Notes</span><span>{s.notes}</span></div>{/if}
    {#if s.voided_at}
      <div class="flex justify-between text-[var(--crimson-fg)]"><span>Voided at</span><span>{formatDateTime(s.voided_at)}</span></div>
      {#if s.void_reason}<div class="flex justify-between text-[var(--crimson-fg)]"><span>Reason</span><span>{s.void_reason}</span></div>{/if}
    {/if}
  </div>
</PageShell>

<Modal bind:open={showVoid} title="Void sale" maxWidth="max-w-sm">
  <p class="text-sm text-[var(--text-2)] mb-3">Stock will be restored. This cannot be undone.</p>
  <Input label="Reason (optional)" bind:value={voidReason} placeholder="e.g. Customer returned items" />
  {#snippet footer()}
    <div class="flex gap-2">
      <Button variant="secondary" onclick={() => showVoid = false} class="flex-1 justify-center">Cancel</Button>
      <Button variant="danger" loading={voiding} onclick={doVoid} class="flex-1 justify-center">Void sale</Button>
    </div>
  {/snippet}
</Modal>
