<script lang="ts">
  let {
    name,
    size = 20,
    strokeWidth = 1.75,
    class: cls = '',
    style = '',
  }: {
    name: string;
    size?: number;
    strokeWidth?: number;
    class?: string;
    style?: string;
  } = $props();

  // Import lucide icons
  import * as icons from 'lucide-svelte';
  
  // Resolve to actual component each render with fallback
  const IconComponent = (icons as Record<string, unknown>)[name];
</script>

{#if IconComponent}
  <IconComponent {size} {strokeWidth} class={cls} {style} />
{:else}
  <!-- Fallback icon if not found -->
  <div class="w-[20px] h-[20px] flex items-center justify-center rounded border">
    ?
  </div>
{/if}
