<script lang="ts">
  import { onMount } from 'svelte';
  import { invalidateAll } from '$app/navigation';
  import { toasts } from '$lib/stores/toast.svelte';
  import { theme } from '$lib/stores/theme.svelte';
  import { PALETTES } from '$lib/config/palettes';
  import { Sun, Moon, Monitor, Check } from 'lucide-svelte';

  let { data } = $props();


  let paletteId = $state<string>((data as any).shop?.palette_id ?? 'graphite-mint');
  let themeMode = $state<'light' | 'dark' | 'system'>((data as any).shop?.theme ?? 'system');
  let saving    = $state(false);

  // Live preview — applies to the whole app immediately, no save needed.
  // These two calls go through the theme store, which writes the CSS
  // variables on the next tick and pulses the transition.
  function previewPalette(id: string) {
    paletteId = id;
    theme.setPalette(id);
  }

  function previewMode(m: 'light' | 'dark' | 'system') {
    themeMode = m;
    theme.setMode(m);
  }

  async function save() {
    saving = true;
    try {
      const ok = await theme.persist();
      if (ok) {
        toasts.success('Appearance saved');
        await invalidateAll();
      } else toasts.error('Failed to save');
    } catch {
      toasts.error('Network error');
    } finally {
      saving = false;
    }
  }

  // Native event delegation as a safety net.  Svelte 5's compiled
  // `onclick` should fire these directly, but the user reported the
  // live preview doing nothing on this specific page and we couldn't
  // reproduce why.  A document-level capture listener with `data-*`
  // attributes always works, and is idempotent with the Svelte handler
  // (both call the same theme store functions).
  onMount(() => {
    const handleClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement)?.closest(
        '[data-palette], [data-mode]',
      ) as HTMLElement | null;
      if (!target) return;
      e.preventDefault();
      e.stopPropagation();
      if (target.dataset.palette) {
        previewPalette(target.dataset.palette);
      } else if (target.dataset.mode) {
        previewMode(target.dataset.mode as 'light' | 'dark' | 'system');
      }
    };
    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
  });
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
     surrounding UI updates immediately with a 280ms colour transition. -->

<section class="mb-6">
  <div class="flex items-baseline justify-between mb-3">
    <h2 class="text-[13px] font-semibold text-[var(--text-2)] uppercase tracking-wide">Palette</h2>
    <p class="text-[11px] text-[var(--text-3)]">{PALETTES.length} presets · click to preview</p>
  </div>
  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
    {#each PALETTES as p (p.id)}
      {@const active = p.id === paletteId}
      {@const light  = p.light}
      {@const dark   = p.dark}
      <button
        type="button"
        data-palette={p.id}
        class="group relative text-left rounded-2xl overflow-hidden border-2 transition-all duration-200 ease-out hover:scale-[1.02] hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 {active ? 'shadow-lg' : 'hover:shadow-md'}"
        style="border-color:{active ? p.accent : 'var(--border)'};"
        onclick={() => previewPalette(p.id)}
        aria-pressed={active}
      >
        <!-- Active indicator -->
        {#if active}
          <div class="absolute top-3 right-3 z-10 w-6 h-6 rounded-full flex items-center justify-center" style="background:{p.accent};">
            <Check size={12} strokeWidth={3} class="text-white" />
          </div>
        {/if}

        <!-- Split preview: Light (top) + Dark (bottom) -->
        <div class="relative">
          <!-- Light mode preview -->
          <div class="px-4 pt-4 pb-3" style="background:{light.bg};">
            <!-- Mini sidebar + content mock -->
            <div class="flex gap-2">
              <!-- Sidebar mock -->
              <div class="w-8 h-16 rounded-lg flex flex-col items-center py-1.5 gap-1" style="background:{light.sidebarBg};">
                <div class="w-3 h-3 rounded" style="background:{light.sidebarAccent};"></div>
                <div class="w-5 h-1 rounded-sm" style="background:{light.sidebarMuted};opacity:0.6;"></div>
                <div class="w-4 h-1 rounded-sm" style="background:{light.sidebarMuted};opacity:0.4;"></div>
              </div>
              <!-- Content area -->
              <div class="flex-1 space-y-1.5">
                <div class="h-1.5 rounded-sm" style="background:{light.text};width:60%;opacity:0.7;"></div>
                <div class="h-1 rounded-sm" style="background:{light.text3};width:40%;opacity:0.5;"></div>
                <div class="flex gap-1 mt-2">
                  <div class="px-1.5 py-0.5 rounded text-[7px] font-bold" style="background:{light.primary};color:{light.primaryFg};">BTN</div>
                  <div class="px-1.5 py-0.5 rounded text-[7px]" style="background:{light.surface2};color:{light.text2};border:1px solid {light.border};">TAG</div>
                </div>
              </div>
            </div>
          </div>

          <!-- Accent divider -->
          <div class="h-1" style="background:linear-gradient(90deg,{p.accent},{p.accent}88);"></div>

          <!-- Dark mode preview -->
          <div class="px-4 pt-3 pb-3" style="background:{dark.bg};">
            <div class="flex gap-2">
              <div class="w-8 h-16 rounded-lg flex flex-col items-center py-1.5 gap-1" style="background:{dark.sidebarBg};">
                <div class="w-3 h-3 rounded" style="background:{dark.sidebarAccent};"></div>
                <div class="w-5 h-1 rounded-sm" style="background:{dark.sidebarMuted};opacity:0.6;"></div>
                <div class="w-4 h-1 rounded-sm" style="background:{dark.sidebarMuted};opacity:0.4;"></div>
              </div>
              <div class="flex-1 space-y-1.5">
                <div class="h-1.5 rounded-sm" style="background:{dark.text};width:60%;opacity:0.7;"></div>
                <div class="h-1 rounded-sm" style="background:{dark.text3};width:40%;opacity:0.5;"></div>
                <div class="flex gap-1 mt-2">
                  <div class="px-1.5 py-0.5 rounded text-[7px] font-bold" style="background:{dark.primary};color:{dark.primaryFg};">BTN</div>
                  <div class="px-1.5 py-0.5 rounded text-[7px]" style="background:{dark.surface2};color:{dark.text2};border:1px solid {dark.border};">TAG</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Color palette strip -->
        <div class="flex h-8" aria-hidden="true">
          <div class="flex-1 transition-all group-hover:flex-[1.3]" style="background:{light.primary};" title="Primary"></div>
          <div class="flex-1 transition-all group-hover:flex-[1.2]" style="background:{p.accent};" title="Accent"></div>
          <div class="flex-1 transition-all group-hover:flex-[1.1]" style="background:{dark.primary};" title="Primary Dark"></div>
          <div class="flex-1 transition-all" style="background:{light.sidebarBg};" title="Sidebar Light"></div>
          <div class="flex-1 transition-all" style="background:{dark.sidebarBg};" title="Sidebar Dark"></div>
        </div>

        <!-- Meta -->
        <div class="px-4 py-3 flex items-baseline gap-2" style="background:var(--surface);">
          <p class="text-[14px] font-semibold text-[var(--text)] truncate">{p.name}</p>
          <p class="text-[11px] text-[var(--text-3)] truncate italic">{p.tagline}</p>
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
        data-mode={opt.v}
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
