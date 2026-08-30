<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { formatCompact } from '$lib/utils/format';
  import type { Chart as ChartType, ChartConfiguration } from 'chart.js';

  let {
    data          = [],
    labels        = [],
    color         = 'var(--primary)',
    height        = 120,
    borderRadius  = 5,
    currencyMode  = false,
    yFormat       = 'number',
    showYAxis     = false,
    highlightLast = false,
  }: {
    data?:          number[];
    labels?:        string[];
    color?:         string;
    height?:        number | string;
    borderRadius?:  number;
    currencyMode?:  boolean;
    yFormat?:       'number' | 'currency' | 'count';
    showYAxis?:     boolean;
    highlightLast?: boolean;
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

  function fmt(n: number): string {
    return formatCompact(n);
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

    // Per-bar background — fade earlier bars to give a visual "weight" gradient
    // to the most recent one (only when highlightLast).
    const colors = data.map((_, i) => {
      if (!highlightLast) return barColor;
      const isLast = i === data.length - 1;
      return isLast ? barColor : barColor + '70';
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
          maxBarThickness: 36,
        }],
      },
      options: {
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
              label: (ctx) => tooltipFmt(ctx.parsed.y ?? 0),
            },
          },
        },
        scales: {
          y: {
            display: showYAxis,
            beginAtZero: true,
            grid:  { color: border + '80', lineWidth: 1 },
            border: { display: false },
            ticks: {
              color:   text3,
              font:    { size: 11, weight: 500 },
              padding: 8,
              maxTicksLimit: 5,
              callback: (v) => fmt(v as number),
            },
          },
          x: {
            grid:  { display: false },
            border: { color: border, display: true },
            ticks: { color: text3, font: { size: 11, weight: 500 }, padding: 6, maxRotation: 0, autoSkipPadding: 8 },
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
    const _data   = data;
    const _labels = labels;
    const _color  = color;
    if (!chart) return;

    const barColor = resolveColor(_color);
    const colors = _data.map((_, i) => {
      if (!highlightLast) return barColor;
      return i === _data.length - 1 ? barColor : barColor + '70';
    });

    chart.data.labels = _labels;
    chart.data.datasets[0].data               = _data;
    chart.data.datasets[0].backgroundColor    = colors as any;
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