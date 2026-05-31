<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    variant  = 'neutral',
    class: cls = '',
    children,
  }: {
    variant?:  'primary' | 'gold' | 'cobalt' | 'crimson' | 'teal' | 'rose' | 'neutral';
    class?:    string;
    children?: Snippet;
  } = $props();
</script>

<span class="badge badge-{variant} {cls}">
  {@render children?.()}
</span>
