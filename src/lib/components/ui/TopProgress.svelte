<script lang="ts">
  /**
   * TopProgress — a thin loading bar that appears at the very top of
   * the page during SvelteKit client-side navigations.  Implemented
   * with a CSS animation that ramps from 0% to 80% (fast) then 80%
   * to 100% (slow) so the bar always feels like it's making progress
   * and the visible state change at the end is satisfying.
   *
   * Tracks `$app/state` `navigating` so it lights up on link clicks,
   * programmatic goto()s, and form submissions.  SSR doesn't fire
   * `navigating`, so the bar is hidden on initial load — the
   * server-rendered content shows instantly.
   */
  import { navigating } from '$app/state';
  import { fade } from 'svelte/transition';
</script>

{#if navigating.to}
  <div
    class="top-progress"
    role="progressbar"
    aria-label="Loading"
    transition:fade={{ duration: 120 }}
  ></div>
{/if}

<style>
  .top-progress {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    height: 2px;
    z-index: 1000;
    background: linear-gradient(
      90deg,
      transparent 0%,
      var(--primary) 30%,
      var(--primary) 60%,
      transparent 100%
    );
    background-size: 200% 100%;
    background-repeat: no-repeat;
    background-position: -100% 0;
    animation: top-progress 1.2s cubic-bezier(0.4, 0, 0.2, 1) infinite;
    pointer-events: none;
    /* Soft glow to make it pop against the header */
    box-shadow: 0 0 8px 0 color-mix(in srgb, var(--primary) 50%, transparent);
  }
  @keyframes top-progress {
    0%   { background-position: -100% 0; }
    100% { background-position:  200% 0; }
  }
  @media (prefers-reduced-motion: reduce) {
    .top-progress { animation: none; background: var(--primary); width: 100%; }
  }
</style>
