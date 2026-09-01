<script lang="ts">
  import { goto } from '$app/navigation';
  import { PALETTES, type Palette } from '$lib/config/palettes';
  import { theme as themeStore } from '$lib/stores/theme.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import { appearanceSchema, type FieldErrors } from '$lib/validators';

  let selectedPalette = $state(PALETTES[0]);
  let themeMode       = $state<'light'|'dark'|'system'>('system');
  let formError = $state('');
  let fieldErrors: FieldErrors<{ primary_color: string; sidebar_bg: string; theme: string }> = $state({});
  let loading         = $state(false);

  function choosePalette(p: Palette) {
    selectedPalette = p;
    const tokens = themeMode === 'dark' ? p.dark : p.light;
    themeStore.applyShopPalette(tokens.primary, tokens.sidebarBg);
  }

  // The actual hex values being sent depend on the active theme mode
  const activePrimary  = $derived(themeMode === 'dark' ? selectedPalette.dark.primary  : selectedPalette.light.primary);
  const activeSidebar  = $derived(themeMode === 'dark' ? selectedPalette.dark.sidebarBg : selectedPalette.light.sidebarBg);

  async function next() {
    formError = '';
    fieldErrors = {};
    const payload = {
      primary_color: activePrimary,
      sidebar_bg:    activeSidebar,
      theme:         themeMode,
      palette_id:    selectedPalette.id,
    };
    const parsed = appearanceSchema.safeParse(payload);
    if (!parsed.success) {
      const flat: any = {};
      for (const i of parsed.error.issues) {
        const k = i.path[0]; if (typeof k === 'string' && !flat[k]) flat[k] = i.message;
      }
      fieldErrors = flat;
      return;
    }

    loading = true;
    try {
      const res = await fetch('/api/onboarding/appearance', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });
      const data = await res.json();
      if (!res.ok) {
        formError = data.error ?? 'Failed to save';
        return;
      }
      goto('/onboarding/team');
    } catch {
      formError = 'Network error';
    } finally {
      loading = false;
    }
  }
</script>

<svelte:head><title>Choose a look · Shëlf</title></svelte:head>

<div class="card p-6 fade-up">
  <h2 class="font-semibold mb-1">Choose your look</h2>
  <p class="text-xs text-[var(--text-3)] mb-5">Pick a palette — you can change it later in settings.</p>

  {#if formError}
    <div class="bg-[var(--crimson-dim)] text-[var(--crimson-fg)] text-[12px] rounded-lg p-3 mb-4 flex items-start gap-2"
         role="alert">
      <span class="w-1 self-stretch rounded-full bg-[var(--crimson)] shrink-0"></span>
      <span>{formError}</span>
    </div>
  {/if}

  <div class="grid grid-cols-2 gap-2 mb-5">
    {#each PALETTES as p}
      {@const selected = selectedPalette.id === p.id}
      {@const tok = themeMode === 'dark' ? p.dark : p.light}
      <button
        type="button"
        class="p-3 rounded-xl border-2 text-left transition-all relative"
        style="border-color:{selected ? tok.primary : 'var(--border)'};background:{selected ? 'color-mix(in srgb,'+tok.primary+' 10%,transparent)' : 'var(--surface2)'}"
        onclick={() => choosePalette(p)}
      >
        {#if selected}
          <span
            class="absolute top-2 right-2 w-4 h-4 rounded-full flex items-center justify-center text-white text-[9px]"
            style="background:{tok.primary}"
            aria-label="Selected"
          >✓</span>
        {/if}
        <div class="flex items-center gap-2 mb-1">
          <div class="w-5 h-5 rounded-full" style="background:{tok.primary}"></div>
          <div class="w-5 h-5 rounded-full" style="background:{tok.sidebarBg};border:1px solid var(--border)"></div>
        </div>
        <p class="text-xs font-semibold">{p.name}</p>
        <p class="text-[10px] text-[var(--text-3)]">{p.tagline}</p>
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

  <div class="flex gap-2">
    <Button variant="secondary" href="/onboarding/locale" class="flex-1 justify-center">Back</Button>
    <Button onclick={next} {loading} class="flex-1 justify-center">Continue →</Button>
  </div>
</div>
