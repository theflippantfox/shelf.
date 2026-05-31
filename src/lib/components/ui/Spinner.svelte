<script lang="ts">
  let { size = 20, class: cls = '' }: { size?: number; class?: string } = $props();
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2.5"
  class="animate-spin {cls}"
  aria-label="Loading"
>
  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
</svg>
