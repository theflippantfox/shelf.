<script lang="ts">
  /**
   * ProductCardSkeleton — a shimmering placeholder for the product grid.
   *
   * Matches the shape of the real product card exactly (same padding,
   * gaps, heights) so the layout doesn't jump when the data arrives.
   * The shimmer is the existing .shimmer utility (a moving linear-
   * gradient over var(--surface) ↔ var(--surface2)) so it's cheap
   * (one CSS animation per element, GPU-composited).
   *
   * Stagger them with the same anim-stagger class the real grid
   * uses, so the cards appear to "fill in" left-to-right.
   */
  let {
    class: cls = '',
  }: {
    class?: string;
  } = $props();
</script>

<div class="surface-card p-3.5 flex flex-col gap-2 {cls}" aria-hidden="true">
  <!-- Top: icon + (in-cart chip) -->
  <div class="flex items-start justify-between">
    <div class="w-10 h-10 rounded-lg shimmer"></div>
    <div class="h-4 w-12 rounded-full shimmer"></div>
  </div>

  <!-- Name (2 lines) + SKU -->
  <div class="min-w-0 flex flex-col gap-1.5 mt-1">
    <div class="h-3.5 w-full rounded shimmer"></div>
    <div class="h-3.5 w-2/3 rounded shimmer"></div>
    <div class="h-2.5 w-1/2 rounded shimmer mt-0.5"></div>
  </div>

  <!-- Price -->
  <div class="h-5 w-20 rounded shimmer mt-1"></div>

  <!-- Stock bar + qty -->
  <div class="flex items-center gap-2 mt-auto">
    <div class="flex-1 h-1 rounded-full bg-[var(--surface2)]"></div>
    <div class="h-2.5 w-5 rounded shimmer"></div>
  </div>

  <!-- Add button placeholder -->
  <div class="w-full h-7 rounded-md shimmer"></div>
</div>
