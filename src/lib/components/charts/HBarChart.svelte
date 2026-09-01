<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { Chart as ChartType, ChartConfiguration } from 'chart.js';
  import { formatCurrency, formatCurrencyMajor } from '$lib/utils/format';
  import { mountChartTooltip, type ChartTooltipHandle } from '$lib/utils/chartTooltip';
  import { setupTooltipAutoHide } from '$lib/utils/chartTooltipAutoHide';

  /**
   * HBarChart — horizontal bar chart for product/category leaderboards.
   * Same premium treatment as BarChart: custom HTML tooltip, brand chrome.
   */
  let {
    data        = [],
    labels      = [],
    color       = 'var(--primary)',
    height,
    currencyMode = false,
    yFormat     = 'number',
  }: {
    data?:         number[];
    labels?:       string[];
    color?:        string;
    height?:       number | string;
    currencyMode?: boolean;
    yFormat?:      'number' | 'currency' | 'count';
  } = $props();

  let canvas: HTMLCanvasElement;
  let chart:  ChartType | null = null;
  let observer: MutationObserver;
  let ChartCtor: typeof ChartType | null = null;
  let tooltip: ChartTooltipHandle | null = null;
  let disposeAutoHide: (() => void) | null = null;

  function css(name: string): string {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }
  function resolveColor(c: string): string {
    const m = c.match(/^var\((--[^)]+)\)$/);
    return m ? css(m[1]) : c;
  }

  // Auto-size to data length when no explicit height is given.
  const computedHeight = $derived(height ?? Math.max(120, data.length * 32 + 20));

  function fmt(n: number): string {
    if (yFormat === 'currency') {
      const major = currencyMode ? n : n / 100;
      const abs = Math.abs(major);
      const sign = major < 0 ? '-' : '';
      if (abs >= 1_000_000) return sign + formatCurrencyMajor(abs / 1_000_000, { decimals: 1 }) + 'M';
      if (abs >= 1_000)     return sign + formatCurrencyMajor(abs / 1_000,     { decimals: 1 }) + 'k';
      return sign + formatCurrencyMajor(abs, { decimals: 0 });
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

  function hideTooltip() {
    tooltip?.destroy();
    tooltip = null;
  }

  function externalTooltip(context: any) {
    const { chart: c, tooltip: t } = context;
    if (!t || t.opacity === 0 || !c || !canvas) {
      hideTooltip();
      return;
    }

    const idx = t.dataPoints?.[0]?.dataIndex ?? 0;
    const label = labels[idx] ?? '';
    const value = data[idx] ?? 0;

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
    const border    = css('--border');

    return {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: barColor,
          hoverBackgroundColor: barColor,
          borderRadius: 4,
          borderSkipped: false,
          barThickness: 16,
        }],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 700, easing: 'easeOutQuart' },
        interaction: { mode: 'nearest', intersect: false },
        layout: { padding: { top: 4, right: 8, bottom: 4, left: 0 } },
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
          x: {
            display: true,
            beginAtZero: true,
            grid:  { color: border + '40', drawTicks: false },
            border: { display: false },
            ticks: {
              color:   text3,
              font:    { size: 10.5, weight: 500 },
              padding: 4,
              maxTicksLimit: 5,
              callback: (v) => fmt(v as number),
            },
          },
          y: {
            grid:  { display: false },
            border: { display: false },
            ticks: {
              color: css('--text'),
              font:  { size: 11.5, weight: 500 },
              padding: 8,
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
    disposeAutoHide = setupTooltipAutoHide(canvas, hideTooltip);
  });

  $effect(() => {
    if (!chart) return;
    chart.data.labels = labels;
    chart.data.datasets[0].data = data;
    chart.update('active');
  });

  onDestroy(() => {
    disposeAutoHide?.();
    hideTooltip();
    chart?.destroy();
    observer?.disconnect();
  });
</script>

<div class="relative" style="height: {computedHeight}px;">
  <canvas bind:this={canvas}></canvas>
</div>