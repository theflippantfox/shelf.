<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { toasts }   from '$lib/stores/toast.svelte';
  import PageShell from '$lib/components/layout/PageShell.svelte';
  import Input     from '$lib/components/ui/Input.svelte';
  import Toggle    from '$lib/components/ui/Toggle.svelte';
  import Button    from '$lib/components/ui/Button.svelte';
  import { ArrowLeft } from 'lucide-svelte';

  let { data } = $props();
  const shop = data.shop as any;

  // tax_rate stored as integer basis points: 750 = 7.50%
  let taxRateStr   = $state(((shop.tax_rate ?? 0) / 100).toFixed(2));
  let taxName      = $state(shop.tax_name      ?? 'Tax');
  let taxInclusive = $state(shop.tax_inclusive ?? false);
  let saving       = $state(false);

  async function save() {
    saving = true;
    const rateFloat = parseFloat(taxRateStr) || 0;
    const res = await fetch('/api/settings', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tax_rate:      Math.round(rateFloat * 100), // to basis points
        tax_name:      taxName,
        tax_inclusive: taxInclusive,
      }),
    });
    if (res.ok) { toasts.success('Tax settings saved'); await invalidateAll(); }
    else toasts.error('Failed to save');
    saving = false;
  }
</script>

<svelte:head><title>Taxes · Shëlf</title></svelte:head>
<PageShell>
  <div class="flex items-center gap-3 mb-5">
    <a href="/settings" class="btn btn-ghost btn-icon btn-sm"><ArrowLeft size={16} strokeWidth={1.75} /></a>
    <p class="font-semibold text-sm">Taxes</p>
  </div>
  <div class="card p-5 flex flex-col gap-5 max-w-lg">
    <Input
      label="Tax rate (%)"
      type="number"
      bind:value={taxRateStr}
      hint="e.g. 7.5 for 7.5%. Set to 0 to disable."
    />
    <Input
      label="Tax name"
      bind:value={taxName}
      hint="Shown on receipts and checkout. e.g. VAT, GST, Sales Tax"
    />
    <Toggle
      bind:checked={taxInclusive}
      label="Prices are tax-inclusive"
    />
    {#if taxInclusive}
      <p class="text-xs text-[var(--text-3)] bg-[var(--surface2)] rounded-lg p-3">
        Tax will be extracted from the sale total rather than added on top.
        e.g. ₦1,000 at 7.5% → tax = ₦69.77, net = ₦930.23.
      </p>
    {:else}
      <p class="text-xs text-[var(--text-3)] bg-[var(--surface2)] rounded-lg p-3">
        Tax will be added on top of the sale total at checkout.
        e.g. ₦1,000 + 7.5% tax = ₦1,075.00.
      </p>
    {/if}
    <div class="flex justify-end">
      <Button onclick={save} loading={saving}>Save tax settings</Button>
    </div>
  </div>
</PageShell>
