<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    children,
    class: cls = '',
  }: {
    children?: Snippet;
    class?: string;
  } = $props();
</script>

<div class="page-shell fade-up {cls}">
  {@render children?.()}
</div>
