<script lang="ts">
  import { goto } from '$app/navigation';
  import { CATEGORY_COLORS } from '$lib/config/palettes';
  import { ICONS, CATEGORY_ICON_KEYS } from '$lib/config/icons';
  import Button     from '$lib/components/ui/Button.svelte';
  import Input      from '$lib/components/ui/Input.svelte';
  import ColorSwatch from '$lib/components/ui/ColorSwatch.svelte';
  import DynamicIcon from '$lib/components/ui/DynamicIcon.svelte';
  import { Plus, Trash2 } from 'lucide-svelte';

  interface Cat { name: string; icon: string; color: string }

  const PRESETS: Cat[] = [
    { name: 'Skincare',   icon: 'Sparkles', color: '#7B4F8A' },
    { name: 'Makeup',     icon: 'Wand2',    color: '#C03868' },
    { name: 'Haircare',   icon: 'Scissors', color: '#C5930A' },
    { name: 'Body care',  icon: 'Droplets', color: '#0D7A6E' },
    { name: 'Fragrance',  icon: 'Wind',     color: '#2E5FC7' },
    { name: 'Nails',      icon: 'Brush',    color: '#B85430' },
  ];

  let categories = $state<Cat[]>([...PRESETS]);
  let loading    = $state(false);

  function add() { categories = [...categories, { name: '', icon: 'Tag', color: CATEGORY_COLORS[0] }]; }
  function remove(i: number) { categories = categories.filter((_, idx) => idx !== i); }

  async function next() {
    loading = true;
    await fetch('/api/onboarding/categories', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categories: categories.filter(c => c.name.trim()) }),
    });
    goto('/onboarding/complete');
    loading = false;
  }
</script>

<svelte:head><title>Categories · Shëlf</title></svelte:head>
<div class="card p-6 fade-up">
  <h2 class="font-semibold mb-1">Set up categories</h2>
  <p class="text-xs text-[var(--text-3)] mb-4">Organise your inventory. Edit or remove as needed.</p>
  <div class="flex flex-col gap-3 mb-4 max-h-72 overflow-y-auto pr-1">
    {#each categories as cat, i}
      <div class="flex items-center gap-2">
        <div class="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
             style="background:color-mix(in srgb,{cat.color} 18%,transparent)">
          <DynamicIcon name={cat.icon} size={15} style="color:{cat.color}" />
        </div>
        <input bind:value={cat.name} placeholder="Category name"
               class="input text-xs flex-1 py-1.5" />
        <button class="btn btn-ghost btn-icon btn-sm" onclick={() => remove(i)}>
          <Trash2 size={13} strokeWidth={1.75} />
        </button>
      </div>
    {/each}
  </div>
  <button class="btn btn-secondary btn-sm w-full justify-center mb-5" onclick={add}>
    <Plus size={14} strokeWidth={2} /> Add category
  </button>
  <Button onclick={next} {loading} class="w-full justify-center">Finish setup →</Button>
</div>
