<script lang="ts">
  import { goto } from '$app/navigation';
  import Input  from '$lib/components/ui/Input.svelte';
  import Button from '$lib/components/ui/Button.svelte';

  let name     = $state('');
  let slug     = $state('');
  let error    = $state('');
  let loading  = $state(false);

  function autoSlug() {
    if (!slug) slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  }

  async function next() {
    error = ''; loading = true;
    try {
      const res  = await fetch('/api/onboarding/shop', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, slug }),
      });
      const data = await res.json();
      if (!res.ok) { error = data.error ?? 'Failed to create shop'; return; }
      goto('/onboarding/locale');
    } catch { error = 'Network error'; }
    finally { loading = false; }
  }
</script>

<svelte:head><title>Your shop · Shëlf</title></svelte:head>
<div class="card p-6 fade-up">
  <h2 class="font-semibold mb-1">Name your shop</h2>
  <p class="text-xs text-[var(--text-3)] mb-5">You can change this anytime in settings.</p>
  {#if error}
    <div class="bg-[var(--crimson-dim)] text-[var(--crimson-fg)] text-xs rounded-lg p-3 mb-4">{error}</div>
  {/if}
  <form onsubmit={(e) => { e.preventDefault(); next(); }} class="flex flex-col gap-4">
    <Input label="Shop name" bind:value={name} placeholder="e.g. Glam Studio" required
           onchange={autoSlug} />
    <Input label="Shop handle" bind:value={slug} placeholder="e.g. glam-studio"
           hint="Used in your URL. Letters, numbers, and hyphens only." />
    <div class="flex gap-2">
    <Button variant="secondary" href="/welcome" class="flex-1 justify-center">← Back</Button>
    <Button type="submit" {loading} class="flex-1 justify-center">Continue →</Button>
  </div>
  </form>
</div>
