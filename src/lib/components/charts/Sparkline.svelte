<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { Chart as ChartType, ChartConfiguration } from 'chart.js';

  /**
   * Sparkline — minimal line chart for KPI cards and inline trend.
   * No axes, no tooltip, just a clean curve with a soft gradient fill.
   */
  let {
    data     = [],
    color    = 'var(--primary)',
    height   = 40,
    fill     = true,
  }: {
    data?:   number[];
    color?:  string;
    height?: number | string;
    fill?:   boolean;
  } = $props();

  let canvas: HTMLCanvasElement;
  let chart:  ChartType | null = null;
  let observer: MutationObserver;
  let ChartCtor: typeof ChartType | null = null;

  function css(name: string): string {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }
  function resolveColor(c: string): string {
    const m = c.match(/^var\((--[^)]+)\)$/);
    return m ? css(m[1]) : c;
  }
  function px(h: number | string): string {
    return typeof h === 'number' ? `${h}px` : h;
  }

  function buildConfig(): ChartConfiguration<'line'> {
    const c = resolveColor(color);
    return {
      type: 'line',
      data: {
        labels: data.map((_, i) => String(i)),
        datasets: [{
          data,
          borderColor: c,
          backgroundColor: (ctx: any) => {
            const chart = ctx.chart;
            const { ctx: c2d, chartArea } = chart;
            if (!chartArea) return c + '20';
            const grad = c2d.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
            grad.addColorStop(0, c + '30');
            grad.addColorStop(1, c + '00');
            return grad;
          },
          fill,
          tension: 0.4,
          pointRadius: 0,
          borderWidth: 2,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 700, easing: 'easeOutQuart' },
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: {
          x: { display: false },
          y: { display: false, beginAtZero: false },
        },
        elements: { line: { borderJoinStyle: 'round' } },
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
    observer = new MutationObserver(rebuild);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  });

  $effect(() => {
    if (!chart) return;
    chart.data.labels = data.map((_, i) => String(i));
    chart.data.datasets[0].data = data;
    chart.update('active');
  });

  onDestroy(() => {
    chart?.destroy();
    observer?.disconnect();
  });
</script>

<div style="height: {px(height)}; width: 100%;">
  <canvas bind:this={canvas}></canvas>
</div>