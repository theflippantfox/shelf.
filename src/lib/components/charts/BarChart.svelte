<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { Chart as ChartType, ChartConfiguration, TooltipItem } from 'chart.js';
  import { formatCurrency, formatCurrencyMajor } from '$lib/utils/format';
  import { mountChartTooltip, type ChartTooltipHandle } from '$lib/utils/chartTooltip';

  /**
   * BarChart — premium bar chart with custom HTML tooltip.
   *
   * Same chart.js engine, but:
   * - Custom HTML tooltip via the `external` callback (no default JS tooltip)
   * - Brand-tinted gridlines, axis labels, and bar hover state
   * - Tabular numbers on every label
   * - Optional highlightLast: last bar is full color, earlier bars are dim
   * - Currency formatting aware
   */
  let {
    data           = [],
    labels         = [],
    color          = 'var(--primary)',
    height         = 220,
    borderRadius   = 6,
    currencyMode   = false,
    yFormat        = 'number',
    showYAxis      = true,
    highlightLast  = false,
    /** When true, render a soft area gradient under the line. */
    showYAxisLabel = '',
  }: {
    data?:           number[];
    labels?:         string[];
    color?:          string;
    height?:         number | string;
    borderRadius?:   number;
    currencyMode?:   boolean;
    yFormat?:        'number' | 'currency' | 'count';
    showYAxis?:      boolean;
    highlightLast?:  boolean;
    showYAxisLabel?: string;
  } = $props();

  let canvas: HTMLCanvasElement;
  let chart:  ChartType | null = null;
  let observer: MutationObserver;
  let ChartCtor: typeof ChartType | null = null;
  let tooltip: ChartTooltipHandle | null = null;

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
    if (yFormat === 'currency') {
      // Chart data is already in major units when currencyMode is set;
      // otherwise we expect minor units (cents) and divide by 100.
      const major = currencyMode ? n : n / 100;
      return formatCurrencyMajor(major, { decimals: 1 });
    }
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'k';
    return String(n);
  }
  function tooltipFmt(n: number): string {
    if (yFormat === 'currency') {
      const major = currencyMode ? n : n / 100;
      return formatCurrency(major);
    }
    return n.toLocaleString();
  }

  // Custom HTML tooltip — styled to match the rest of the app.
  // Uses viewport-fixed positioning (via chartTooltip util) so it can
  // never be clipped by an ancestor's overflow: hidden when the bar
  // sits at the right edge of the chart.
  function externalTooltip(context: any) {
    const { chart: c, tooltip: t } = context;
    if (!t || t.opacity === 0 || !c || !canvas) {
      tooltip?.destroy();
      tooltip = null;
      return;
    }

    const idx = t.dataPoints?.[0]?.dataIndex ?? 0;
    const value = data[idx] ?? 0;
    const label = labels[idx] ?? '';

    const html = `
      <div style="color: var(--text-3); font-size: 10.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 2px;">${label}</div>
      <div style="color: var(--text); font-weight: 600; font-size: 13px;">${tooltipFmt(value)}</div>
    `;

    if (tooltip) {
      tooltip.reposition({ canvas, caretX: t.caretX, caretY: t.caretY, placement: 'auto' });
      tooltip.el.innerHTML = html;
    } else {
      tooltip = mountChartTooltip(html, {
        canvas,
        caretX: t.caretX,
        caretY: t.caretY,
        placement: 'auto',
      });
    }
  }

  function buildConfig(): ChartConfiguration<'bar'> {
    const barColor  = resolveColor(color);
    const text3     = css('--text-3');
    const text2     = css('--text-2');
    const border    = css('--border');
    const surface2  = css('--surface2');

    const colors = data.map((_, i) => {
      if (!highlightLast) return barColor;
      const isLast = i === data.length - 1;
      return isLast ? barColor : barColor + '55';
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
          categoryPercentage: 0.7,
          barPercentage: 0.85,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 700, easing: 'easeOutQuart' },
        interaction: { mode: 'index', intersect: false },
        layout: { padding: { top: 12, right: 4, bottom: 4, left: 0 } },
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled: false,
            external: externalTooltip as any,
            mode: 'index',
            intersect: false,
          },
        },
        scales: {
          y: {
            display: showYAxis,
            beginAtZero: true,
            grid:  { color: border + '40', lineWidth: 1 },
            border: { display: false },
            ticks: {
              color:   text3,
              font:    { size: 10.5, weight: 500 },
              padding: 8,
              maxTicksLimit: 5,
              callback: (v) => fmt(v as number),
            },
          },
          x: {
            grid:  { display: false },
            border: { color: border, display: false },
            ticks: {
              color: text3,
              font:  { size: 10.5, weight: 500 },
              padding: 4,
              maxRotation: 0,
              autoSkipPadding: 12,
            },
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
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  });

  $effect(() => {
    const _data   = data;
    const _labels = labels;
    const _color  = color;
    if (!chart) return;

    const barColor = resolveColor(_color);
    const colors = _data.map((_, i) => {
      if (!highlightLast) return barColor;
      return i === _data.length - 1 ? barColor : barColor + '55';
    });

    chart.data.labels = _labels;
    chart.data.datasets[0].data               = _data;
    chart.data.datasets[0].backgroundColor    = colors as any;
    chart.data.datasets[0].hoverBackgroundColor = barColor;
    chart.update('active');
  });

  onDestroy(() => {
    tooltip?.destroy();
    tooltip = null;
    chart?.destroy();
    observer?.disconnect();
  });
</script>

<div class="relative" style="height: {px(height)};">
  <canvas bind:this={canvas}></canvas>
</div>