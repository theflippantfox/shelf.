<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { toasts } from '$lib/stores/toast.svelte';
  import { theme as themeStore } from '$lib/stores/theme.svelte';
  import { PALETTES } from '$lib/config/palettes';
  import { Sun, Moon, Monitor, Check } from 'lucide-svelte';

  let { data } = $props();
  const shop = (data as any).shop;

  let paletteId   = $state<string>(shop.palette_id ?? 'graphite-mint');
  let themeMode   = $state<'light' | 'dark' | 'system'>(shop.theme ?? 'system');
  let saving      = $state(false);

  // Live preview — applies to the whole app immediately, no save needed
  function previewPalette(id: string) {
    paletteId = id;
    themeStore.applyShopPalette(id);
  }

  async function save() {
    saving = true;
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ palette_id: paletteId, theme: themeMode }),
      });
      if (res.ok) {
        toasts.success('Appearance saved');
        await invalidateAll();
      } else toasts.error('Failed to save');
    } catch {
      toasts.error('Network error');
    } finally {
      saving = false;
    }
  }

  // Live mode preview (no save) — applies just the mode, not palette
  function previewMode(m: 'light' | 'dark' | 'system') {
    themeMode = m;
    themeStore.set(m);
  }
</script>

<svelte:head><title>Appearance · Shëlf</title></svelte:head>

<header class="flex items-end justify-between gap-3 mb-5">
  <div class="min-w-0">
    <h1 class="text-[22px] md:text-[26px] font-semibold text-[var(--text)] tracking-tight">
      Appearance
    </h1>
  </div>
  <button
    type="button"
    class="btn btn-primary btn-sm gap-1.5"
    onclick={save}
    disabled={saving}
  >
    {saving ? 'Saving…' : 'Save appearance'}
  </button>
</header>

<!-- The whole app is the live preview. Pick a palette or mode and the
     surrounding UI updates immediately with a 240ms colour transition. -->

<section class="mb-6">
  <div class="flex items-baseline justify-between mb-3">
    <h2 class="text-[13px] font-semibold text-[var(--text-2)] uppercase tracking-wide">Palette</h2>
    <p class="text-[11px] text-[var(--text-3)]">{PALETTES.length} presets</p>
  </div>
  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
    {#each PALETTES as p (p.id)}
      {@const active = p.id === paletteId}
      {@const light  = p.light}
      <button
        type="button"
        class="group relative text-left rounded-[14px] overflow-hidden border-2 transition-all {active ? 'shadow-[0_0_0_3px_color-mix(in_srgb,var(--primary)_22%,transparent)]' : 'hover:-translate-y-0.5'}"
        style="border-color:{active ? 'var(--primary)' : 'var(--border)'};"
        onclick={() => previewPalette(p.id)}
        aria-pressed={active}
      >
        <!-- Mini-preview: 3 swatches + 2 mock surfaces -->
        <div class="flex h-20">
          <div class="flex-1 flex items-end p-2.5 gap-1.5" style="background:{light.surface};">
            <div class="w-7 h-7 rounded-md" style="background:{light.primary};"></div>
            <div class="w-7 h-7 rounded-md border" style="background:{light.surface2}; border-color:{light.border}"></div>
            <div class="w-7 h-7 rounded-md" style="background:{p.accent};"></div>
          </div>
          <div class="w-1/3 p-2.5 flex flex-col justify-end" style="background:{light.sidebarBg};">
            <div class="h-1.5 rounded-sm mb-1" style="background:{p.accent}; width:60%"></div>
            <div class="h-1 rounded-sm mb-1" style="background:{light.sidebarMuted}; width:80%; opacity:0.5"></div>
            <div class="h-1 rounded-sm"        style="background:{light.sidebarMuted}; width:50%; opacity:0.5"></div>
          </div>
        </div>

        <!-- Meta -->
        <div class="p-3" style="background:var(--surface);">
          <div class="flex items-center gap-2">
            <p class="text-[13px] font-semibold text-[var(--text)] flex-1 min-w-0 truncate">{p.name}</p>
            {#if active}
              <span class="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--primary-fg)] px-1.5 py-0.5 rounded" style="background:var(--primary);">
                <Check size={10} strokeWidth={3} /> active
              </span>
            {/if}
          </div>
        </div>
      </button>
    {/each}
  </div>
</section>

<!-- Theme mode -->
<section class="surface-card p-4 md:p-5">
  <h2 class="text-[13px] font-semibold text-[var(--text-2)] uppercase tracking-wide mb-3">Colour mode</h2>
  <div class="grid grid-cols-3 gap-2">
    {#each [
      { v: 'light'  as const, l: 'Light',  I: Sun },
      { v: 'dark'   as const, l: 'Dark',   I: Moon },
      { v: 'system' as const, l: 'System', I: Monitor },
    ] as opt}
      {@const active = themeMode === opt.v}
      <button
        type="button"
        class="py-3 rounded-[10px] border text-[12.5px] font-semibold flex flex-col items-center gap-1.5 transition-all"
        style="background:{active ? 'var(--primary)' : 'var(--surface2)'};
               color:{active ? 'var(--primary-fg)' : 'var(--text-2)'};
               border-color:{active ? 'var(--primary)' : 'var(--border)'};"
        onclick={() => previewMode(opt.v)}
        aria-pressed={active}
      >
        <opt.I size={16} strokeWidth={1.75} />
        {opt.l}
      </button>
    {/each}
  </div>
</section>
