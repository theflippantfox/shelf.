<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { Chart as ChartType, ChartConfiguration } from 'chart.js';

  let {
    data         = [],
    labels       = [],
    color        = 'var(--primary)',
    height       = 200,
    borderRadius = 5,
    currencyMode = false,
    yFormat      = 'number',
    highlightMax = true,
  }: {
    data?:         number[];
    labels?:       string[];
    color?:        string;
    height?:       number | string;
    borderRadius?: number;
    currencyMode?: boolean;
    yFormat?:      'number' | 'currency' | 'count';
    highlightMax?: boolean;
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

  function tooltipFmt(n: number): string {
    if (yFormat === 'currency') return '₹' + n.toLocaleString('en-IN');
    return n.toLocaleString('en-IN');
  }

  function buildConfig(): ChartConfiguration<'bar'> {
    const barColor = resolveColor(color);
    const text3    = css('--text-3');
    const border   = css('--border');
    const surface  = css('--surface');
    const text     = css('--text');
    const text2    = css('--text-2');

    const maxVal = Math.max(...data, 0);
    const colors = data.map((v) => {
      if (highlightMax && v === maxVal && v > 0) return barColor;
      return barColor + '70';
    });

    return {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: colors,
          hoverBackgroundColor: barColor,
          borderRadius: { topLeft: borderRadius, topRight: borderRadius, bottomLeft: 0, bottomRight: 0 } as any,
          borderSkipped: false,
          maxBarThickness: 22,
        }],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 600, easing: 'easeOutQuart' },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: surface,
            borderColor:     border,
            borderWidth:     1,
            titleColor:      text,
            bodyColor:       text2,
            padding:         { top: 8, bottom: 8, left: 12, right: 12 },
            cornerRadius:    8,
            titleFont:       { size: 11, weight: 600 },
            bodyFont:        { size: 11, weight: 500 },
            displayColors:   false,
            callbacks: {
              label: (ctx) => tooltipFmt(ctx.parsed.x ?? 0),
            },
          },
        },
        scales: {
          x: {
            display: false,
            beginAtZero: true,
          },
          y: {
            grid:  { display: false },
            border: { color: border, display: false },
            ticks: { color: text2, font: { size: 11, weight: 500 }, padding: 8 },
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
    const _data   = data;
    const _labels = labels;
    const _color  = color;
    if (!chart) return;

    const barColor = resolveColor(_color);
    const maxVal = Math.max(..._data, 0);
    const colors = _data.map((v) => {
      if (highlightMax && v === maxVal && v > 0) return barColor;
      return barColor + '70';
    });

    chart.data.labels = _labels;
    chart.data.datasets[0].data                = _data;
    chart.data.datasets[0].backgroundColor     = colors as any;
    chart.data.datasets[0].hoverBackgroundColor = barColor;

    chart.update('active');
  });

  onDestroy(() => {
    chart?.destroy();
    observer?.disconnect();
  });
</script>

<div style="height: {px(height)};">
  <canvas bind:this={canvas}></canvas>
</div>