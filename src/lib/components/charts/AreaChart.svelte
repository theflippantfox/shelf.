<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { Chart, ChartConfiguration, ChartDataset } from 'chart.js';

  let {
    labels,
    datasets,
    height = 220,
    fill = true,
  }: {
    labels: string[];
    datasets: ChartDataset<'line', number[]>[];
    height?: number;
    fill?: boolean;
  } = $props();

  let canvas: HTMLCanvasElement;
  let chart: Chart | null = null;

  function getCssVar(name: string) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function buildConfig(): ChartConfiguration<'line'> {
    const primary = getCssVar('--primary');
    const text3 = getCssVar('--text-3');

    return {
      type: 'line',
      data: {
        labels,
        datasets: datasets.map((ds) => ({
          ...ds,
          borderColor: (ds as any).borderColor ?? primary,
          backgroundColor: (ds as any).backgroundColor ?? (fill ? `${primary}26` : 'transparent'),
          fill: (ds as any).fill ?? fill,
          tension: 0.4,
          pointRadius: 2,
          borderWidth: 2,
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 400 },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'var(--surface-2)',
            borderColor: 'var(--border)',
            borderWidth: 1,
            titleColor: 'var(--text-1)',
            bodyColor: 'var(--text-2)',
            padding: 10,
            cornerRadius: 8,
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            grid: { color: 'rgba(255,255,255,0.06)' },
            ticks: { color: text3, font: { size: 10 } },
          },
          x: {
            grid: { display: false },
            ticks: { color: text3, font: { size: 10 } },
          },
        },
      },
    };
  }

  onMount(async () => {
    const { Chart, registerables } = await import('chart.js');
    Chart.register(...registerables);
    if (!canvas) return;
    chart = new Chart(canvas, buildConfig());
  });

  $effect(() => {
    if (!chart) return;
    chart.data.labels = labels;
    chart.data.datasets = datasets as any;
    chart.update('active');
  });

  onDestroy(() => {
    chart?.destroy();
  });
</script>

<div style="height:{height}px;position:relative;">
  <canvas bind:this={canvas}></canvas>
</div>
