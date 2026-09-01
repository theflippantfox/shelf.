<script lang="ts">
  import { onMount } from 'svelte';

  /**
   * Animated number counter. Renders a formatted number that smoothly
   * tweens to its target value.
   *
   * - On mount: animates 0 → value
   * - On value change: animates prev → value
   *
   * Uses ease-out-quart for a snappy, premium feel.
   */
  let {
    value,
    duration = 700,
    format = (n: number) => Math.round(n).toLocaleString(),
  }: {
    value: number;
    duration?: number;
    format?: (n: number) => string;
  } = $props();

  let displayed = $state(0);
  let mounted = false;
  let prev = 0;

  function animate(from: number, to: number, dur: number) {
    const start = performance.now();
    const delta = to - from;
    if (delta === 0) { displayed = to; return; }
    function tick(now: number) {
      const t = Math.min(1, (now - start) / dur);
      const e = 1 - Math.pow(1 - t, 4);
      displayed = from + delta * e;
      if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  onMount(() => {
    mounted = true;
    animate(0, value, duration);
    prev = value;
  });

  $effect(() => {
    if (!mounted) return;
    if (value !== prev) {
      animate(prev, value, duration);
      prev = value;
    }
  });
</script>

<span class="tabular">{format(displayed)}</span>