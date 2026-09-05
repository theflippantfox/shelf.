<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { toasts }        from '$lib/stores/toast.svelte';
  import Input     from '$lib/components/ui/Input.svelte';
  import Button    from '$lib/components/ui/Button.svelte';

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

  <header class="flex items-end justify-between gap-3 mb-5">
  <div class="min-w-0">
    <h1 class="text-[22px] md:text-[26px] font-semibold text-[var(--text)] tracking-tight mt-0.5">Shop details</h1>
  </div>
</header>
  <div class="surface-card p-4 md:p-5 flex flex-col gap-4 max-w-lg">
    <Input label="Shop name" bind:value={name} required />
    <Input label="Handle / slug" bind:value={slug}
           hint="Letters, numbers, hyphens only. Used in internal URLs." />
    <div class="flex justify-end">
      <Button onclick={save} loading={saving}>Save changes</Button>
    </div>
  </div>
