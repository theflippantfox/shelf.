<script lang="ts">
  import { CATEGORY_ICON_KEYS, ICONS } from '$lib/config/icons';
  import DynamicIcon from './DynamicIcon.svelte';

  let {
    value    = $bindable('Sparkles'),
    onchange,
  }: {
    value?:   string;
    onchange?: (name: string) => void;
  } = $props();
</script>

<div class="grid grid-cols-6 gap-1.5">
  {#each CATEGORY_ICON_KEYS as key}
    {@const iconName = ICONS[key]}
    <button
      type="button"
      class="w-9 h-9 rounded-lg flex items-center justify-center transition-colors"
      style="background:{value === iconName ? 'var(--primary-dim)' : 'var(--surface2)'};color:{value === iconName ? 'var(--primary)' : 'var(--text-3)'}"
      onclick={() => { value = iconName; onchange?.(iconName); }}
      title={key}
      aria-label={key}
      aria-pressed={value === iconName}
    >
      <DynamicIcon name={iconName} size={16} />
    </button>
  {/each}
</div>
