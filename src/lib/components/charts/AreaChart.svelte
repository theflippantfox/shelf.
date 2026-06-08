<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { Chart as ChartType, ChartConfiguration, ChartDataset } from 'chart.js';

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
  let chart: ChartType | null = null;
  let observer: MutationObserver;
  let ChartCtor: typeof ChartType | null = null;

  function css(name: string): string {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function resolve(color: string | undefined): string | undefined {
    if (!color) return color;
    const m = color.match(/^var\((--[^)]+)\)$/);
    return m ? css(m[1]) : color;
  }

  function buildConfig(): ChartConfiguration<'line'> {
    const primary = css('--primary');
    const text3   = css('--text-3');
    const border  = css('--border');
    const surface = css('--surface');
    const text    = css('--text');
    const text2   = css('--text-2');

    return {
      type: 'line',
      data: {
        labels,
        datasets: datasets.map((ds) => {
          const bc     = resolve((ds as any).borderColor);
          const bg     = resolve((ds as any).backgroundColor);
          const dsFill = (ds as any).fill ?? fill;
          return {
            ...ds,
            borderColor:     bc ?? primary,
            backgroundColor: bg ?? (dsFill ? `${primary}26` : 'transparent'),
            fill:            dsFill,
            tension:         0.4,
            pointRadius:     2,
            borderWidth:     2,
          };
        }),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 400 },
        plugins: {
          legend: {
            display: datasets.length > 1,
            labels: {
              color:    text2,
              boxWidth: 10,
              padding:  16,
              font:     { size: 10 },
            },
          },
          tooltip: {
            backgroundColor: surface,
            borderColor:     border,
            borderWidth:     1,
            titleColor:      text,
            bodyColor:       text2,
            padding:         10,
            cornerRadius:    8,
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            grid:  { color: border },
            ticks: { color: text3, font: { size: 10 } },
          },
          x: {
            grid:  { display: false },
            ticks: { color: text3, font: { size: 10 } },
          },
        },
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
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
  });

  $effect(() => {
    // ⚠️ Read reactive props BEFORE any early return.
    // Svelte only tracks dependencies that are read during execution —
    // an early return before reading `labels`/`datasets` means the effect
    // never re-runs when the metric buttons change the data.
    const l = labels;
    const d = datasets;
    if (!chart) return;

    const primary = css('--primary');
    const text2   = css('--text-2');

    chart.data.labels = l;
    chart.data.datasets = d.map((ds: any) => {
      const dsFill = ds.fill ?? fill;
      return {
        ...ds,
        borderColor:     resolve(ds.borderColor)     ?? primary,
        backgroundColor: resolve(ds.backgroundColor) ?? (dsFill ? `${primary}26` : 'transparent'),
        fill:            dsFill,
      };
    }) as any;

    // Keep legend visibility in sync with dataset count
    (chart.options as any).plugins.legend.display        = d.length > 1;
    (chart.options as any).plugins.legend.labels.color   = text2;

    chart.update('active');
  });

  onDestroy(() => {
    chart?.destroy();
    observer?.disconnect();
  });
</script>

<div style="height:{height}px; position:relative;">
  <canvas bind:this={canvas}></canvas>
</div>
