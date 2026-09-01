<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { toasts } from '$lib/stores/toast.svelte';
  import Button    from '$lib/components/ui/Button.svelte';

  let { data } = $props();
  const shop = data.shop as any;

  let header = $state(shop.receipt_header ?? '');
  let footer = $state(shop.receipt_footer ?? 'Thank you for your purchase!');
  let saving = $state(false);

  async function save() {
    saving = true;
    const res = await fetch('/api/settings', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ receipt_header: header, receipt_footer: footer }),
    });
    if (res.ok) { toasts.success('Receipt settings saved'); await invalidateAll(); }
    else toasts.error('Failed to save');
    saving = false;
  }
</script>

<svelte:head><title>Receipt · Shëlf</title></svelte:head>

  <header class="flex items-end justify-between gap-3 mb-5">
  <div class="min-w-0">
    <h1 class="text-[22px] md:text-[26px] font-semibold text-[var(--text)] tracking-tight mt-0.5">Receipt</h1>
  </div>
</header>
  <div class="surface-card p-4 md:p-5 flex flex-col gap-5 max-w-lg">
    <div class="input-group">
      <label class="input-label">Receipt header</label>
      <textarea bind:value={header} class="input" rows="3"
        placeholder="e.g. Your shop name, address, phone number..."></textarea>
      <p class="input-hint">Appears at the top of every receipt.</p>
    </div>
    <div class="input-group">
      <label class="input-label">Receipt footer</label>
      <textarea bind:value={footer} class="input" rows="3"
        placeholder="e.g. Thank you for shopping with us!"></textarea>
      <p class="input-hint">Appears at the bottom of every receipt.</p>
    </div>

    <!-- Preview -->
    <div class="border border-dashed border-[var(--border)] rounded-xl p-4 font-mono text-[11px] text-[var(--text-2)] whitespace-pre-wrap">
      {#if header}<div class="border-b border-dashed border-[var(--border)] pb-2 mb-2">{header}</div>{/if}
      <div class="text-center my-2 text-[var(--text-3)]">— item list —</div>
      {#if footer}<div class="border-t border-dashed border-[var(--border)] pt-2 mt-2 text-center">{footer}</div>{/if}
    </div>

    <div class="flex justify-end">
      <Button onclick={save} loading={saving}>Save receipt</Button>
    </div>
  </div>
