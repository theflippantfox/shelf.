<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { toasts } from '$lib/stores/toast.svelte';
  import { theme as themeStore } from '$lib/stores/theme.svelte';
  import { PALETTES, getPalette } from '$lib/config/palettes';
  import { applyTokens } from '$lib/utils/colorUtils';
  import { Sun, Moon, Monitor, Check } from 'lucide-svelte';

  let { data } = $props();

  // `$derived` so `shop` tracks `data` after `invalidateAll()` — the
  // `const shop = data.shop` form captures the initial reference and
  // goes stale after a save reloads the page data.
  const shop = $derived((data as any).shop);

  // Initialize from the first-render `shop` value (synchronously, so SSR
  // and the first client render agree — no hydration mismatch).  After
  // the first render, `shop` is still tracked reactively; nothing else
  // needs to react to it because the form fields are the source of
  // truth once the user starts clicking palettes.
  let paletteId   = $state<string>((data as any).shop?.palette_id ?? 'graphite-mint');
  let themeMode   = $state<'light' | 'dark' | 'system'>((data as any).shop?.theme ?? 'system');
  let saving      = $state(false);

  // Direct theme application — bypasses the theme store and goes straight
  // to applyTokens().  This is the same function the store calls internally
  // but it runs synchronously in the click handler with no store-side
  // state mutation that could be raced by the layout's $effect.pre.
  // If the store call ever silently no-ops, this will still work.
  function _applyPaletteDirect(id: string) {
    if (typeof document === 'undefined') return;
    const p = getPalette(id);
    if (!p) return;
    const isDark = themeMode === 'dark'
      || (themeMode === 'system' && typeof window !== 'undefined'
          && window.matchMedia('(prefers-color-scheme: dark)').matches);
    applyTokens(isDark ? p.dark : p.light);
    // Also pulse the transition class so the change animates
    document.documentElement.classList.add('palette-transitioning');
    setTimeout(() => {
      document.documentElement.classList.remove('palette-transitioning');
    }, 280);
  }

  // Live preview — applies to the whole app immediately, no save needed
  function previewPalette(id: string) {
    paletteId = id;
    // 1) Direct path — guaranteed to update the DOM even if the store
    //    is somehow stale or shadowed by another instance.
    _applyPaletteDirect(id);
    // 2) Store path — keeps the store in sync so the layout's $effect.pre
    //    doesn't reset the visual back to the saved palette.
    try { themeStore.applyShopPalette(id); } catch {}
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
    // 1) Direct path — toggle the dark class and re-apply the current
    //    palette's tokens under the new mode.
    if (typeof document !== 'undefined') {
      const isDark = m === 'dark'
        || (m === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      document.documentElement.classList.toggle('dark', isDark);
      const p = getPalette(paletteId);
      if (p) {
        applyTokens(isDark ? p.dark : p.light);
        document.documentElement.classList.add('palette-transitioning');
        setTimeout(() => {
          document.documentElement.classList.remove('palette-transitioning');
        }, 280);
      }
      try { localStorage.setItem('shelf-theme', m); } catch {}
    }
    // 2) Store path — keeps the store in sync.
    try { themeStore.set(m); } catch {}
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
    <p class="text-[11px] text-[var(--text-3)]">{PALETTES.length} presets · click to preview</p>
  </div>
  <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
    {#each PALETTES as p (p.id)}
      {@const active = p.id === paletteId}
      {@const light  = p.light}
      <button
        type="button"
        class="group relative text-left rounded-[12px] overflow-hidden border transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 {active ? 'shadow-[0_0_0_2px_var(--primary)]' : 'border-[var(--border)]'}"
        style="border-color:{active ? 'var(--primary)' : 'var(--border)'};"
        onclick={() => previewPalette(p.id)}
        aria-pressed={active}
      >
        <!-- Accent stripe — the palette's signature color, one row at the top -->
        <div class="h-1.5" style="background:{p.accent};"></div>

        <!-- Composition preview: primary button + text samples, on the surface -->
        <div class="relative px-3.5 pt-4 pb-3" style="background:{light.surface};">
          {#if active}
            <span
              class="absolute top-2 right-2 inline-flex items-center justify-center w-5 h-5 rounded-full"
              style="background:var(--primary);color:var(--primary-fg);"
              aria-hidden="true"
            >
              <Check size={11} strokeWidth={3.5} />
            </span>
          {/if}

          <!-- Header line: text + secondary text, mimics a card heading -->
          <div class="mb-2.5 space-y-1">
            <div class="h-2 rounded-sm" style="background:{light.text}; width:72%; opacity:0.85;"></div>
            <div class="h-1.5 rounded-sm" style="background:{light.text2}; width:48%; opacity:0.55;"></div>
          </div>

          <!-- Primary chip + neutral chips side by side -->
          <div class="flex items-center gap-1.5">
            <div
              class="h-6 px-2 inline-flex items-center rounded-md text-[9px] font-bold uppercase tracking-wider"
              style="background:{light.primary};color:{light.primaryFg};"
            >Primary</div>
            <div
              class="h-6 px-2 inline-flex items-center rounded-md text-[9px] font-semibold"
              style="background:{light.surface2};color:{light.text2};border:1px solid {light.border};"
            >Chip</div>
            <div
              class="h-6 px-2 inline-flex items-center rounded-md text-[9px] font-semibold"
              style="background:transparent;color:{light.text3};border:1px dashed {light.border};"
            >Ghost</div>
          </div>
        </div>

        <!-- Swatch strip — six key tokens, single horizontal row -->
        <div class="flex h-6" aria-hidden="true">
          <div class="flex-1" style="background:{light.bg};" title="bg"></div>
          <div class="flex-1" style="background:{light.surface};" title="surface"></div>
          <div class="flex-1" style="background:{light.surface2};" title="surface2"></div>
          <div class="flex-1" style="background:{light.primary};" title="primary"></div>
          <div class="flex-1" style="background:{p.accent};" title="accent"></div>
          <div class="flex-1" style="background:{light.sidebarBg};" title="sidebar"></div>
        </div>

        <!-- Meta -->
        <div class="px-3.5 py-2.5 flex items-baseline gap-1.5" style="background:var(--surface);">
          <p class="text-[13px] font-semibold text-[var(--text)] truncate">{p.name}</p>
          <p class="text-[10.5px] text-[var(--text-3)] truncate">· {p.tagline}</p>
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
