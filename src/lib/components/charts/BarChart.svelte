<script lang="ts">
  export let data: number[] = [];
  export let labels: string[] = [];
  export let color: string = 'var(--primary)';
  export let borderRadius: number = 3;
  export let height: number | string = 120;

  let canvas: HTMLCanvasElement;
  let chart: any;
  let observer: MutationObserver;

  import { onMount, onDestroy } from 'svelte';
  import Chart from 'chart.js/auto';

  function css(name: string): string {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  // Canvas cannot resolve CSS custom properties — do it ourselves
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

    const barColor  = resolveColor(color);
    const tickColor = css('--text-3');
    const gridColor = css('--border');

    chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [{ data, backgroundColor: barColor, borderRadius }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: {
            display: false,
          },
          x: {
            grid:  { display: false },
            ticks: { color: tickColor, font: { size: 10 } },
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

  $: if (chart && data) {
    chart.data.labels = labels;
    chart.data.datasets[0].data = data;
    chart.data.datasets[0].backgroundColor = resolveColor(color);
    chart.update('none');
  }

  onDestroy(() => {
    chart?.destroy();
    observer?.disconnect();
  });
</script>

<div style="height: {px(height)};">
  <canvas bind:this={canvas}></canvas>
</div>
