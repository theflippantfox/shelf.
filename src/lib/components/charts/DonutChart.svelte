<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import Chart from 'chart.js/auto';

  let {
    values = [],
    labels = [],
    colors = [
      'var(--primary)',
      'var(--cobalt)',
      'var(--gold)',
      'var(--rose)',
      'var(--crimson)',
    ],
    height = 200,
  }: {
    values?: number[];
    labels?: string[];
    colors?: string[];
    height?: number | string;
  } = $props();

  let canvas: HTMLCanvasElement;
  let chart: any;
  let observer: MutationObserver;

  function css(name: string): string {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function resolveColors(cs: string[]): string[] {
    return cs.map((c) => {
      const m = c.match(/^var\((--[^)]+)\)$/);
      return m ? css(m[1]) : c;
    });
  }

  function px(h: number | string): string {
    return typeof h === 'number' ? `${h}px` : h;
  }

  function initChart() {
    if (!canvas) return;
    chart?.destroy();
    chart = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data: values,
          backgroundColor: resolveColors(colors).slice(0, values.length),
          borderWidth: 0,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        cutout: '75%',
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
    const _values = values;
    const _labels = labels;
    const _colors = colors;
    if (!chart) return;
    chart.data.labels = _labels;
    chart.data.datasets[0].data            = _values;
    chart.data.datasets[0].backgroundColor = resolveColors(_colors).slice(0, _values.length);
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

