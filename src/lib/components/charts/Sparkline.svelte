<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import Chart from 'chart.js/auto';

  let {
    data = [],
    color = 'var(--primary)',
    width = 80,
    height = 30,
  }: {
    data?: number[];
    color?: string;
    width?: number;
    height?: number;
  } = $props();

  let canvas: HTMLCanvasElement;
  let chart: any;

  function css(name: string): string {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function resolveColor(c: string): string {
    const m = c.match(/^var\((--[^)]+)\)$/);
    return m ? css(m[1]) : c;
  }

  onMount(() => {
    if (!canvas) return;
    chart = new Chart(canvas, {
      type: 'line',
      data: {
        labels: data.map((_, i) => i),
        datasets: [{
          data,
          borderColor:     resolveColor(color),
          backgroundColor: 'transparent',
          fill:            false,
          tension:         0.4,
          pointRadius:     1,
          borderWidth:     2,
        }],
      },
      options: {
        responsive: false,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: {
          x: { display: false },
          y: { display: false },
        },
      },
    });
  });

  $effect(() => {
    const _data  = data;
    const _color = color;
    if (!chart) return;
    chart.data.labels                    = _data.map((_: any, i: number) => i);
    chart.data.datasets[0].data          = _data;
    chart.data.datasets[0].borderColor   = resolveColor(_color);
    chart.update('none');
  });

  onDestroy(() => chart?.destroy());
</script>

<canvas
  bind:this={canvas}
  {width}
  {height}
  style="width: {width}px; height: {height}px;"
/>
