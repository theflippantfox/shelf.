<script lang="ts">
  import * as icons from 'lucide-svelte';

  let {
    name,
    size        = 20,
    strokeWidth = 1.75,
    class: cls  = '',
    style       = '',
  }: {
    name:         string;
    size?:        number;
    strokeWidth?: number;
    class?:       string;
    style?:       string;
  } = $props();

  // Resolve to actual component each render
  const resolvedIcon = $derived(
    (icons as Record<string, unknown>)[name] as (typeof icons.Package) | undefined
  );
</script>

{#if resolvedIcon}
  <svelte:component this={resolvedIcon} {size} {strokeWidth} class={cls} {style} />
{/if}
