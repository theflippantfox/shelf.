<script lang="ts">
  import { invalidateAll } from "$app/navigation";
  import { toasts } from "$lib/stores/toast.svelte";
  import { theme as themeStore } from "$lib/stores/theme.svelte";
  import { PALETTES } from "$lib/config/palettes";
  import { CATEGORY_COLORS } from "$lib/config/palettes";
  import { generateColorScale, applyColorScale } from "$lib/utils/colorUtils";
  import PageShell from "$lib/components/layout/PageShell.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import ColorSwatch from "$lib/components/ui/ColorSwatch.svelte";
  import Toggle from "$lib/components/ui/Toggle.svelte";
  import { ArrowLeft } from "lucide-svelte";

  let { data } = $props();
  const shop = data.shop as any;

  let primary_color = $state(shop.primary_color ?? "#7B4F8A");
  let sidebar_bg = $state(shop.sidebar_bg ?? "#150F1C");
  let themeMode = $state<"light" | "dark" | "system">(shop.theme ?? "system");
  let saving = $state(false);
  let customHex = $state("");

  function previewPalette(p: (typeof PALETTES)[0]) {
    primary_color = p.primary;
    sidebar_bg = p.sidebarBg;
    themeStore.applyShopPalette(p.primary, p.sidebarBg);
  }

  function previewColor(hex: string) {
    primary_color = hex;
    themeStore.applyShopPalette(hex, sidebar_bg);
  }

  function applyCustomHex() {
    const hex = customHex.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(hex)) previewColor(hex);
  }

  async function save() {
    saving = true;
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ primary_color, sidebar_bg, theme: themeMode }),
    });
    if (res.ok) {
      toasts.success("Appearance saved");
      themeStore.set(themeMode);
      await invalidateAll();
    } else toasts.error("Failed to save");
    saving = false;
  }
</script>

<svelte:head><title>Appearance · Shëlf</title></svelte:head>
<PageShell>
  <div class="flex items-center gap-3 mb-5">
    <a href="/settings" class="btn btn-ghost btn-icon btn-sm"
      ><ArrowLeft size={16} strokeWidth={1.75} /></a
    >
    <p class="font-semibold text-sm">Appearance</p>
  </div>

  <div class="flex flex-col gap-5 max-w-lg">
    <!-- Palette presets -->
    <div class="card p-5">
      <p class="text-xs font-semibold text-[var(--text-2)] mb-3">
        Palette presets
      </p>
      <div class="grid grid-cols-2 gap-2">
        {#each PALETTES as p}
          {@const active = p.primary === primary_color}
          <button
            type="button"
            class="p-3 rounded-xl border-2 text-left transition-all"
            style="border-color:{active
              ? p.primary
              : 'var(--border)'};background:{active
              ? `color-mix(in srgb,${p.primary} 10%,transparent)`
              : 'var(--surface2)'}"
            onclick={() => previewPalette(p)}
          >
            <div class="flex items-center gap-2 mb-1.5">
              <div
                class="w-4 h-4 rounded-full"
                style="background:{p.primary}"
              ></div>
              <div
                class="w-4 h-4 rounded-full border border-[var(--border)]"
                style="background:{p.sidebarBg}"
              ></div>
            </div>
            <p class="text-xs font-semibold">{p.name}</p>
            <p class="text-[10px] text-[var(--text-3)]">{p.description}</p>
          </button>
        {/each}
      </div>
    </div>

    <!-- Custom accent color -->
    <div class="card p-5">
      <p class="text-xs font-semibold text-[var(--text-2)] mb-3">
        Custom accent colour
      </p>
      <ColorSwatch
        colors={CATEGORY_COLORS}
        bind:value={primary_color}
        onchange={previewColor}
      />
      <div class="flex gap-2 mt-3">
        <input
          bind:value={customHex}
          placeholder="#7B4F8A"
          class="input text-sm flex-1"
          maxlength="7"
        />
        <Button variant="secondary" size="sm" onclick={applyCustomHex}
          >Apply</Button
        >
      </div>
      <div class="flex items-center gap-2 mt-2">
        <div
          class="w-5 h-5 rounded-md border border-[var(--border)]"
          style="background:{primary_color}"
        ></div>
        <span class="text-xs font-mono text-[var(--text-3)]"
          >{primary_color}</span
        >
      </div>
    </div>

    <!-- Theme mode -->
    <div class="card p-5">
      <p class="text-xs font-semibold text-[var(--text-2)] mb-3">Colour mode</p>
      <div class="grid grid-cols-3 gap-2">
        {#each [["light", "Light", "☀️"], ["dark", "Dark", "🌙"], ["system", "System", "💻"]] as [val, label, emoji]}
          <button
            type="button"
            class="py-2.5 rounded-xl border text-xs font-semibold flex flex-col items-center gap-1 transition-colors"
            style="background:{themeMode === val
              ? 'var(--primary)'
              : 'var(--surface2)'};color:{themeMode === val
              ? '#fff'
              : 'var(--text-2)'};border-color:{themeMode === val
              ? 'var(--primary)'
              : 'var(--border)'}"
            onclick={() => {
              themeMode = val as any;
              themeStore.set(val as any);
            }}>{emoji} {label}</button
          >
        {/each}
      </div>
    </div>

    <div class="flex justify-end">
      <Button onclick={save} loading={saving}>Save appearance</Button>
    </div>
  </div>
</PageShell>
