<script lang="ts">
  import { goto } from '$app/navigation';
  import { PALETTES, type Palette } from '$lib/config/palettes';
  import { theme as themeStore } from '$lib/stores/theme.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import { appearanceSchema } from '$lib/validators';
import { Check } from 'lucide-svelte';

let selectedPalette = $state(PALETTES[0]);
let themeMode       = $state<'light'|'dark'|'system'>('system');
let formError = $state('');
  let loading         = $state(false);

  function choosePalette(p: Palette) {
    selectedPalette = p;
    // Live preview — the whole app updates immediately
    themeStore.setPalette(p.id);
  }

  // The actual hex values being sent depend on the active theme mode
  const activePrimary  = $derived(themeMode === 'dark' ? selectedPalette.dark.primary  : selectedPalette.light.primary);
  const activeSidebar  = $derived(themeMode === 'dark' ? selectedPalette.dark.sidebarBg : selectedPalette.light.sidebarBg);

  async function next() {
    formError = '';
    const payload = {
      primary_color: activePrimary,
      sidebar_bg:    activeSidebar,
      theme:         themeMode,
      palette_id:    selectedPalette.id,
    };
    const parsed = appearanceSchema.safeParse(payload);
    if (!parsed.success) {
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

  <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
    {#each PALETTES as p}
      {@const selected = selectedPalette.id === p.id}
      {@const light = p.light}
      {@const dark = p.dark}
      {@const tok = themeMode === 'dark' ? dark : light}
      <button
        type="button"
        class="group relative p-3 rounded-xl border-2 text-left transition-all duration-200 hover:scale-[1.02] hover:shadow-lg"
        style="border-color:{selected ? p.accent : 'var(--border)'};background:var(--surface);"
        onclick={() => choosePalette(p)}
      >
        {#if selected}
          <div class="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center" style="background:{p.accent};">
            <Check size={10} strokeWidth={3} class="text-white" />
          </div>
        {/if}
        
        <!-- Color preview -->
        <div class="flex gap-1.5 mb-2">
          <div class="w-8 h-8 rounded-lg shadow-inner" style="background:{light.primary};"></div>
          <div class="w-8 h-8 rounded-lg shadow-inner" style="background:{dark.primary};"></div>
          <div class="w-8 h-8 rounded-lg shadow-inner" style="background:{p.accent};"></div>
        </div>
        
        <!-- Mini UI preview -->
        <div class="rounded-lg p-2 mb-2" style="background:{tok.bg};">
          <div class="h-1.5 rounded-sm mb-1" style="background:{tok.text};width:50%;opacity:0.7;"></div>
          <div class="h-1 rounded-sm mb-2" style="background:{tok.text3};width:30%;opacity:0.5;"></div>
          <div class="px-2 py-0.5 rounded text-[8px] font-bold inline-block" style="background:{tok.primary};color:{tok.primaryFg};">Click</div>
        </div>
        
        <p class="text-[13px] font-semibold text-[var(--text)]">{p.name}</p>
        <p class="text-[10px] text-[var(--text-3)] italic">{p.tagline}</p>
      </button>
    {/each}
  </div>

  <div class="flex gap-2 mb-5">
    {#each ['light','dark','system'] as m}
      <button type="button"
        class="flex-1 py-1.5 text-xs font-semibold rounded-lg border transition-colors capitalize"
        style="background:{themeMode===m?'var(--primary)':'var(--surface2)'};color:{themeMode===m?'var(--primary-fg)':'var(--text-2)'};border-color:{themeMode===m?'var(--primary)':'var(--border)'}"
        onclick={() => { themeMode = m as any; themeStore.setMode(m as any); }}>{m}</button>
    {/each}
  </div>

  <div class="flex gap-2">
    <Button variant="secondary" href="/onboarding/locale" class="flex-1 justify-center">Back</Button>
    <Button onclick={next} {loading} class="flex-1 justify-center">Continue →</Button>
  </div>
</div>
