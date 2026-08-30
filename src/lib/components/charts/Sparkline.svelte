<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { Chart as ChartType, ChartConfiguration } from 'chart.js';

  let {
    data     = [],
    color    = 'var(--primary)',
    width    = 80,
    height   = 30,
    showArea = true,
    tension  = 0.4,
  }: {
    data?:     number[];
    color?:    string;
    width?:    number;
    height?:   number;
    showArea?: boolean;
    tension?:  number;
  } = $props();

  let canvas: HTMLCanvasElement;
  let chart:  ChartType | null = null;
  let ChartCtor: typeof ChartType | null = null;

  function css(name: string): string {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function resolveColor(c: string): string {
    const m = c.match(/^var\((--[^)]+)\)$/);
    return m ? css(m[1]) : c;
  }

  function buildConfig(): ChartConfiguration<'line'> {
    const bc  = resolveColor(color);
    return {
      type: 'line',
      data: {
        labels: data.map((_, i) => i),
        datasets: [{
          data,
          borderColor:     bc,
          backgroundColor: showArea ? bc + '30' : 'transparent',
          fill:            showArea,
          tension,
          pointRadius:     0,
          pointHoverRadius: 0,
          borderWidth:     1.75,
        }],
      },
      options: {
        responsive: false,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales:  { x: { display: false }, y: { display: false } },
        animation: false,
      },
    };
  }

  function rebuild() {
    if (!ChartCtor || !canvas) return;
    chart?.destroy();
    chart = new ChartCtor(canvas, buildConfig());
  }

  onMount(async () => {
    const { Chart, registerables } = await import('chart.js');
    Chart.register(...registerables);
    ChartCtor = Chart;
    rebuild();
  });

  $effect(() => {
    const _data  = data;
    const _color = color;
    if (!chart) return;
    chart.data.labels                    = _data.map((_, i) => i);
    chart.data.datasets[0].data          = _data;
    chart.data.datasets[0].borderColor   = resolveColor(_color);
    chart.data.datasets[0].backgroundColor = showArea ? resolveColor(_color) + '30' : 'transparent';
    chart.update('none');
  });

  onDestroy(() => chart?.destroy());
</script>

<canvas
  bind:this={canvas}
  {width}
  {height}
  style="width: {width}px; height: {height}px;"
></canvas>