<script lang="ts">
  import { goto } from '$app/navigation';
  import { CATEGORY_COLORS } from '$lib/config/palettes';
  import { CATEGORY_ICON_KEYS } from '$lib/config/icons';
  import Button     from '$lib/components/ui/Button.svelte';
  import DynamicIcon from '$lib/components/ui/DynamicIcon.svelte';
  import { Plus, Trash2, Palette } from 'lucide-svelte';
  import { categoriesSchema, type FieldErrors } from '$lib/validators';

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
  let fieldErrors: FieldErrors<{ name: string; icon: string; color: string }> = $state({});
  let formError = $state('');
  let loading    = $state(false);
  let editing = $state<number | null>(null);

  function add() {
    categories = [...categories, { name: '', icon: 'Tag', color: CATEGORY_COLORS[0] }];
    editing = categories.length - 1;
  }
  function remove(i: number) {
    categories = categories.filter((_, idx) => idx !== i);
    if (editing !== null && editing >= categories.length) editing = categories.length - 1;
  }

  function clearField(field: keyof typeof fieldErrors) {
    if (fieldErrors[field]) fieldErrors = { ...fieldErrors, [field]: undefined };
  }

  async function next() {
    formError = '';
    fieldErrors = {};
    // Only send categories with a name
    const valid = categories.filter(c => c.name.trim());
    const parsed = categoriesSchema.safeParse({ categories: valid });
    if (!parsed.success) {
      const flat: any = {};
      for (const i of parsed.error.issues) {
        const k = i.path[1] ?? i.path[0];
        if (typeof k === 'string' && !flat[k]) flat[k] = i.message;
      }
      fieldErrors = flat;
      return;
    }

    loading = true;
    try {
      const res = await fetch('/api/onboarding/categories', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });
      const data = await res.json();
      if (!res.ok) {
        formError = data.error ?? 'Failed to save';
        loading = false;
        return;
      }
      goto('/onboarding/complete');
    } catch {
      formError = 'Network error';
    } finally {
      loading = false;
    }
  }
</script>

<svelte:head><title>Categories · Shëlf</title></svelte:head>

<div class="card p-6 fade-up">
  <h2 class="font-semibold mb-1">Set up categories</h2>
  <p class="text-xs text-[var(--text-3)] mb-4">Organise your inventory. Edit, remove, or add as needed.</p>

  {#if formError}
    <div class="bg-[var(--crimson-dim)] text-[var(--crimson-fg)] text-[12px] rounded-lg p-3 mb-4 flex items-start gap-2"
         role="alert">
      <span class="w-1 self-stretch rounded-full bg-[var(--crimson)] shrink-0"></span>
      <span>{formError}</span>
    </div>
  {/if}

  <div class="flex flex-col gap-2 mb-4 max-h-80 overflow-y-auto pr-1">
    {#each categories as cat, i (i)}
      <div class="rounded-xl border border-[var(--border)] bg-[var(--surface2)] overflow-hidden">
        <div class="flex items-center gap-2 p-2.5">
          <div class="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
               style="background:color-mix(in srgb,{cat.color} 18%,transparent)">
            <DynamicIcon name={cat.icon} size={16} style="color:{cat.color}" />
          </div>
          <input
            bind:value={cat.name}
            placeholder="Category name"
            class="input text-xs flex-1 py-1.5"
            oninput={() => clearField('name')}
          />
          <button
            type="button"
            class="btn btn-ghost btn-icon btn-sm"
            onclick={() => (editing = editing === i ? null : i)}
            aria-label="Edit icon and color"
            title="Edit icon & color"
          >
            <Palette size={13} strokeWidth={1.75} />
          </button>
          <button class="btn btn-ghost btn-icon btn-sm" onclick={() => remove(i)} aria-label="Remove">
            <Trash2 size={13} strokeWidth={1.75} />
          </button>
        </div>

        {#if editing === i}
          <div class="border-t border-[var(--border)] bg-[var(--surface)] p-3 space-y-3">
            <div>
              <p class="text-[10px] font-bold uppercase tracking-wide text-[var(--text-3)] mb-1.5">Icon</p>
              <div class="grid grid-cols-8 gap-1.5">
                {#each CATEGORY_ICON_KEYS as key}
                  <button
                    type="button"
                    class="w-8 h-8 rounded-md flex items-center justify-center transition-colors"
                    style="background:{cat.icon === key ? 'color-mix(in srgb, '+cat.color+' 20%, transparent)' : 'var(--surface2)'}; color:{cat.icon === key ? cat.color : 'var(--text-2)'}"
                    onclick={() => (cat.icon = key)}
                    aria-label="Icon: {key}"
                  >
                    <DynamicIcon name={key} size={14} />
                  </button>
                {/each}
              </div>
            </div>

            <div>
              <p class="text-[10px] font-bold uppercase tracking-wide text-[var(--text-3)] mb-1.5">Color</p>
              <div class="flex flex-wrap gap-1.5">
                {#each CATEGORY_COLORS as c}
                  <button
                    type="button"
                    class="w-7 h-7 rounded-md transition-all"
                    style="background:{c}; outline:{cat.color === c ? '2px solid var(--primary)' : 'none'}; outline-offset:2px"
                    onclick={() => (cat.color = c)}
                    aria-label="Color {c}"
                  ></button>
                {/each}
              </div>
            </div>
          </div>
        {/if}
      </div>
    {/each}
  </div>

  <button class="btn btn-secondary btn-sm w-full justify-center mb-5" onclick={add} type="button">
    <Plus size={14} strokeWidth={2} /> Add category
  </button>

  <div class="flex gap-2">
    <Button variant="secondary" href="/onboarding/team" class="flex-1 justify-center">Back</Button>
    <Button onclick={next} {loading} class="flex-1 justify-center">Finish setup →</Button>
  </div>
</div>
