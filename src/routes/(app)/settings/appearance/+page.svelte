<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { toasts } from '$lib/stores/toast.svelte';
  import { theme as themeStore } from '$lib/stores/theme.svelte';
  import { PALETTES, getPalette, type Palette } from '$lib/config/palettes';
  import { Sun, Moon, Monitor, Check } from 'lucide-svelte';

  let { data } = $props();
  const shop = (data as any).shop;

  let paletteId   = $state<string>(shop.palette_id ?? 'graphite-mint');
  let themeMode   = $state<'light' | 'dark' | 'system'>(shop.theme ?? 'system');
  let saving      = $state(false);

  // Live preview — no save needed
  function previewPalette(id: string) {
    paletteId = id;
    themeStore.setPaletteLive(id);
  }

  async function save() {
    saving = true;
    const res = await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ palette_id: paletteId, theme: themeMode }),
    });
    if (res.ok) {
      toasts.success('Appearance saved');
      await themeStore.setPalette(paletteId);
      themeStore.set(themeMode);
      await invalidateAll();
    } else toasts.error('Failed to save');
    saving = false;
  }

  // Live mode preview (no save) — applies just the mode, not palette
  function previewMode(m: 'light' | 'dark' | 'system') {
    themeMode = m;
    themeStore.set(m);
  }
</script>

<svelte:head><title>Appearance · Shëlf</title></svelte:head>

<!-- Inner header for the settings page (no sticky top bar) -->
<header class="flex items-end justify-between gap-3 mb-5">
  <div class="min-w-0">
    <p class="eyebrow">Settings</p>
    <h1 class="text-[22px] md:text-[26px] font-semibold text-[var(--text)] tracking-tight mt-0.5">
      Appearance
    </h1>
    <p class="text-[12.5px] text-[var(--text-3)] mt-0.5">
      Pick a palette. The preview is live — click save to apply it to your shop.
    </p>
  </div>
</header>

<div class="page-shell">

<div class="grid grid-cols-1 lg:grid-cols-[1fr,280px] gap-5 items-start">

  <!-- LEFT: palette grid -->
  <div class="space-y-5">

    <section>
      <div class="flex items-baseline justify-between mb-3">
        <h2 class="text-[13px] font-semibold text-[var(--text-2)] uppercase tracking-wide">Palette</h2>
        <p class="text-[11px] text-[var(--text-3)]">{PALETTES.length} presets</p>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                <div class="w-7 h-7 rounded-md border" style="background:{light.surface2}; border-color:{light.border};"></div>
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
              <p class="text-[11.5px] text-[var(--text-3)] mt-0.5">{p.tagline}</p>
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
  </div>

  <!-- RIGHT: live preview card (stuck on desktop) -->
  <aside class="lg:sticky lg:top-5 space-y-3">
    <h2 class="text-[13px] font-semibold text-[var(--text-2)] uppercase tracking-wide">Live preview</h2>
    {#if true}
      {@const preview = getPalette(paletteId)}
      <div class="surface-card p-4 space-y-3" style="border-radius: 14px;">
      <p class="text-[11.5px] text-[var(--text-3)]">
        How your shop looks right now.
      </p>

      <!-- Mini sidebar preview -->
      <div class="rounded-[10px] overflow-hidden border" style="border-color: {preview.light.border};">
        <div class="flex h-32">
          <div class="w-1/3 p-2 flex flex-col gap-1" style="background:{preview.light.sidebarBg};">
            <div class="h-2 rounded-sm w-2/3 mb-1" style="background:{preview.light.sidebarText}"></div>
            <div class="h-1.5 rounded-sm w-4/5" style="background:{preview.light.sidebarMuted}; opacity:0.4"></div>
            <div class="h-1.5 rounded-sm w-3/4" style="background:{preview.light.sidebarMuted}; opacity:0.4"></div>
            <div class="mt-1 px-1.5 py-1 rounded text-[7px] font-semibold" style="background:{preview.light.sidebarActive}; color:{preview.light.sidebarText}">
              <div class="h-1 rounded-sm w-3/4" style="background:{preview.light.sidebarText}"></div>
            </div>
            <div class="h-1.5 rounded-sm w-2/3" style="background:{preview.light.sidebarMuted}; opacity:0.4"></div>
          </div>
          <div class="flex-1 p-2.5" style="background:{preview.light.bg};">
            <div class="h-2 rounded-sm w-1/2 mb-1.5" style="background:{preview.light.text}"></div>
            <div class="h-1 rounded-sm w-2/3 mb-2" style="background:{preview.light.text3}"></div>
            <div class="rounded-md p-2 mb-1.5" style="background:{preview.light.surface}; border:1px solid {preview.light.border};">
              <div class="h-1.5 rounded-sm w-3/4 mb-1" style="background:{preview.light.text}"></div>
              <div class="h-1 rounded-sm w-1/2" style="background:{preview.light.text3}"></div>
            </div>
            <div class="rounded-md p-1.5 text-[7px] font-semibold inline-block" style="background:linear-gradient(180deg,{preview.light.primary},{preview.light.primaryMid}); color:{preview.light.primaryFg}">
              Primary
            </div>
          </div>
        </div>
      </div>

      <div class="flex items-center gap-2 pt-1">
        <div class="w-3 h-3 rounded-full" style="background:{preview.accent}"></div>
        <p class="text-[11.5px] text-[var(--text-2)]">
          Accent: <span class="font-mono" style="color:{preview.accent}">{preview.accent}</span>
        </p>
      </div>
    </div>
    {/if}

    <button
      type="button"
      class="btn btn-primary btn-lg w-full justify-center"
      onclick={save}
      disabled={saving}
    >
      {saving ? 'Saving…' : 'Save appearance'}
    </button>
    <p class="text-[10.5px] text-[var(--text-3)] text-center leading-relaxed">
      Live preview is applied immediately.<br/> Save to make it stick for everyone.
    </p>
  </aside>
</div>
</div>
