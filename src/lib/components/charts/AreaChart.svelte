<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { formatCompact } from '$lib/utils/format';
  import type { Chart as ChartType, ChartConfiguration, ChartDataset } from 'chart.js';

  let {
    labels,
    datasets,
    height       = 220,
    fill         = true,
    currencyMode = false,
    yFormat      = 'number',   // 'number' | 'currency' | 'count'
  }: {
    labels:           string[];
    datasets:         ChartDataset<'line', number[]>[];
    height?:          number;
    fill?:            boolean;
    currencyMode?:    boolean;
    yFormat?:         'number' | 'currency' | 'count';
  } = $props();

  let canvas: HTMLCanvasElement;
  let chart:  ChartType | null = null;
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

  /** Number → short human label (Indian shorthand: k, L, Cr) */
  function fmt(n: number): string {
    return formatCompact(n);
  }

  function tooltipFmt(n: number): string {
    if (yFormat === 'currency') return '₹' + n.toLocaleString('en-IN');
    if (yFormat === 'count')    return n.toLocaleString('en-IN');
    return n.toLocaleString('en-IN');
  }

  function buildConfig(): ChartConfiguration<'line'> {
    const primary = css('--primary');
    const primaryDim = css('--primary-dim');
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
          const bc     = resolve((ds as any).borderColor) ?? primary;
          const dsFill = (ds as any).fill ?? fill;
          return {
            ...ds,
            borderColor:     bc,
            backgroundColor: dsFill
              ? (ctx: any) => {
                  const { chart: c } = ctx;
                  const { ctx: cctx, chartArea } = c;
                  if (!chartArea) return primaryDim;
                  const g = cctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
                  g.addColorStop(0,    bc + '40');
                  g.addColorStop(0.5,  bc + '20');
                  g.addColorStop(1,    bc + '00');
                  return g;
                }
              : 'transparent',
            fill:            dsFill,
            tension:         0.35,
            pointRadius:     0,
            pointHoverRadius: 5,
            pointBackgroundColor: bc,
            pointBorderColor: surface,
            pointBorderWidth: 2,
            borderWidth:     2.25,
          };
        }),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        animation: { duration: 600, easing: 'easeOutQuart' },
        plugins: {
          legend: {
            display: datasets.length > 1,
            labels: {
              color:    text2,
              boxWidth: 8,
              boxHeight: 8,
              usePointStyle: true,
              pointStyle: 'circle',
              padding:  16,
              font:     { size: 11, weight: 500 },
            },
          },
          tooltip: {
            backgroundColor: surface,
            borderColor:     border,
            borderWidth:     1,
            titleColor:      text,
            bodyColor:       text2,
            padding:         { top: 8, bottom: 8, left: 12, right: 12 },
            cornerRadius:    8,
            boxPadding:      6,
            titleFont:       { size: 11, weight: 600 },
            bodyFont:        { size: 11, weight: 500 },
            displayColors:   true,
            callbacks: {
              label: (ctx) => `  ${ctx.dataset.label ?? ''}: ${tooltipFmt(ctx.parsed.y ?? 0)}`,
            },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            grid:  { color: border + '80', lineWidth: 1 },
            border: { display: false },
            ticks: {
              color:     text3,
              font:      { size: 11, weight: 500 },
              padding:   8,
              maxTicksLimit: 6,
              callback: (v) => fmt(v as number),
            },
          },
          x: {
            grid:  { display: false },
            border: { color: border, display: true },
            ticks: { color: text3, font: { size: 11, weight: 500 }, padding: 8, maxRotation: 0, autoSkipPadding: 12 },
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
    const l = labels;
    const d = datasets;
    if (!chart) return;

    const primary = css('--primary');
    const primaryDim = css('--primary-dim');
    const text2 = css('--text-2');

    chart.data.labels = l;
    chart.data.datasets = d.map((ds: any) => {
      const dsFill = ds.fill ?? fill;
      const bc     = resolve(ds.borderColor) ?? primary;
      return {
        ...ds,
        borderColor: bc,
        backgroundColor: dsFill
          ? (ctx: any) => {
              const { chart: c } = ctx;
              const { ctx: cctx, chartArea } = c;
              if (!chartArea) return primaryDim;
              const g = cctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
              g.addColorStop(0,   bc + '40');
              g.addColorStop(0.5, bc + '20');
              g.addColorStop(1,   bc + '00');
              return g;
            }
          : 'transparent',
        fill: dsFill,
      };
    }) as any;

    (chart.options as any).plugins.legend.display      = d.length > 1;
    (chart.options as any).plugins.legend.labels.color   = text2;
    (chart.options as any).plugins.tooltip.callbacks    = {
      label: (ctx: any) => `  ${ctx.dataset.label ?? ''}: ${tooltipFmt(ctx.parsed.y ?? 0)}`,
    };

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