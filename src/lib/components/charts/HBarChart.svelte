<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import Chart from 'chart.js/auto';

  let {
    data = [],
    labels = [],
    color = 'var(--primary)',
    height = 200,
  }: {
    data?: number[];
    labels?: string[];
    color?: string;
    height?: number | string;
  } = $props();

  let canvas: HTMLCanvasElement;
  let chart: any;
  let observer: MutationObserver;

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

  function initChart() {
    if (!canvas) return;
    chart?.destroy();
    chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [{ data, backgroundColor: resolveColor(color), borderRadius: 3 }],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { display: false },
          y: {
            grid:  { display: false },
            ticks: { color: css('--text-3'), font: { size: 10 } },
          },
        },
      },
    });
  }

  onMount(() => {
    initChart();
    observer = new MutationObserver(initChart);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
  });

  $effect(() => {
    const _data   = data;
    const _labels = labels;
    const _color  = color;
    if (!chart) return;
    chart.data.labels = _labels;
    chart.data.datasets[0].data            = _data;
    chart.data.datasets[0].backgroundColor = resolveColor(_color);
    chart.update('none');
  });

  onDestroy(() => {
    chart?.destroy();
    observer?.disconnect();
  });
</script>

<div style="height: {px(height)};">
  <canvas bind:this={canvas}></canvas>
</div>
