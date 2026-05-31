<script lang="ts">
  import { Check } from 'lucide-svelte';
  import { CATEGORY_COLORS } from '$lib/config/palettes';

  let {
    value    = $bindable(''),
    colors   = CATEGORY_COLORS,
    onchange,
  }: {
    value?:   string;
    colors?:  string[];
    onchange?: (hex: string) => void;
  } = $props();
</script>

<div class="flex flex-wrap gap-2">
  {#each colors as hex}
    <button
      type="button"
      class="w-7 h-7 rounded-full flex items-center justify-center transition-transform hover:scale-110 focus:outline-2 outline-offset-2"
      style="background:{hex};outline-color:{hex}"
      onclick={() => { value = hex; onchange?.(hex); }}
      aria-label="Color {hex}"
      aria-pressed={value === hex}
    >
      {#if value === hex}
        <Check size={13} strokeWidth={2.5} style="color:#fff" />
      {/if}
    </button>
  {/each}
</div>
