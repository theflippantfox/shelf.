<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { currentShop }   from '$lib/stores/shop.svelte';
  import { toasts }        from '$lib/stores/toast.svelte';
  import PageShell from '$lib/components/layout/PageShell.svelte';
  import Input     from '$lib/components/ui/Input.svelte';
  import Button    from '$lib/components/ui/Button.svelte';
  import { ArrowLeft } from 'lucide-svelte';

  let { data } = $props();
  const shop = data.shop as any;

  let name    = $state(shop.name ?? '');
  let slug    = $state(shop.slug ?? '');
  let saving  = $state(false);

  async function save() {
    saving = true;
    const res = await fetch('/api/settings', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, slug }),
    });
    if (res.ok) { toasts.success('Shop details saved'); await invalidateAll(); }
    else toasts.error('Failed to save');
    saving = false;
  }
</script>

<svelte:head><title>Shop Details · Shëlf</title></svelte:head>
<PageShell>
  <div class="flex items-center gap-3 mb-5">
    <a href="/settings" class="btn btn-ghost btn-icon btn-sm"><ArrowLeft size={16} strokeWidth={1.75} /></a>
    <p class="font-semibold text-sm">Shop details</p>
  </div>
  <div class="card p-5 flex flex-col gap-4 max-w-lg">
    <Input label="Shop name" bind:value={name} required />
    <Input label="Handle / slug" bind:value={slug}
           hint="Letters, numbers, hyphens only. Used in internal URLs." />
    <div class="flex justify-end">
      <Button onclick={save} loading={saving}>Save changes</Button>
    </div>
  </div>
</PageShell>
