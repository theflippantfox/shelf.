<script lang="ts">
  import { goto } from '$app/navigation';
  import { PALETTES } from '$lib/config/palettes';
  import { theme as themeStore } from '$lib/stores/theme.svelte';
  import Button from '$lib/components/ui/Button.svelte';

  let selectedPalette = $state(PALETTES[0]);
  let themeMode       = $state<'light'|'dark'|'system'>('system');
  let loading         = $state(false);

  function choosePalette(p: typeof PALETTES[0]) {
    selectedPalette = p;
    themeStore.applyShopPalette(p.primary, p.sidebarBg);
  }

  async function next() {
    loading = true;
    await fetch('/api/onboarding/appearance', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ primary_color: selectedPalette.primary, sidebar_bg: selectedPalette.sidebarBg, theme: themeMode }),
    });
    goto('/onboarding/team');
    loading = false;
  }
</script>

<svelte:head><title>Choose a look · Shëlf</title></svelte:head>
<div class="card p-6 fade-up">
  <h2 class="font-semibold mb-1">Choose your look</h2>
  <p class="text-xs text-[var(--text-3)] mb-5">Pick a palette — you can tweak it later.</p>
  <div class="grid grid-cols-2 gap-2 mb-5">
    {#each PALETTES as p}
      <button
        type="button"
        class="p-3 rounded-xl border-2 text-left transition-all"
        style="border-color:{selectedPalette.name===p.name ? p.primary : 'var(--border)'};background:{selectedPalette.name===p.name ? 'color-mix(in srgb,'+p.primary+' 10%,transparent)' : 'var(--surface2)'}"
        onclick={() => choosePalette(p)}
      >
        <div class="flex items-center gap-2 mb-1">
          <div class="w-5 h-5 rounded-full" style="background:{p.primary}"></div>
          <div class="w-5 h-5 rounded-full" style="background:{p.sidebarBg};border:1px solid var(--border)"></div>
        </div>
        <p class="text-xs font-semibold">{p.name}</p>
        <p class="text-[10px] text-[var(--text-3)]">{p.description}</p>
      </button>
    {/each}
  </div>
  <div class="flex gap-2 mb-5">
    {#each ['light','dark','system'] as m}
      <button type="button"
        class="flex-1 py-1.5 text-xs font-semibold rounded-lg border transition-colors capitalize"
        style="background:{themeMode===m?'var(--primary)':'var(--surface2)'};color:{themeMode===m?'#fff':'var(--text-2)'};border-color:{themeMode===m?'var(--primary)':'var(--border)'}"
        onclick={() => { themeMode = m as any; themeStore.set(m as any); }}>{m}</button>
    {/each}
  </div>
  <Button onclick={next} {loading} class="w-full justify-center">Continue →</Button>
</div>
