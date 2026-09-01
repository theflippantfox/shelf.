<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { Chart as ChartType, ChartConfiguration } from 'chart.js';
  import { formatCurrency, formatCurrencyMajor } from '$lib/utils/format';
  import { mountChartTooltip, type ChartTooltipHandle } from '$lib/utils/chartTooltip';

  /**
   * AreaChart — premium area chart with smooth tension, brand-tinted
   * gradient fill, and custom HTML tooltip.
   *
   * Supports multiple datasets (e.g. current vs previous period).
   */
  let {
    datasets = [],
    labels   = [],
    height   = 280,
    currencyMode = false,
    yFormat  = 'number',
  }: {
    datasets?: Array<{
      label: string;
      data: number[];
      color?: string;
      dashed?: boolean;
    }>;
    labels?:      string[];
    height?:      number | string;
    currencyMode?: boolean;
    yFormat?:     'number' | 'currency' | 'count';
  } = $props();

  let canvas: HTMLCanvasElement;
  let chart:  ChartType | null = null;
  let observer: MutationObserver;
  let ChartCtor: typeof ChartType | null = null;
  let tooltip: ChartTooltipHandle | null = null;

  function css(name: string): string {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }
  function px(h: number | string): string {
    return typeof h === 'number' ? `${h}px` : h;
  }
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

  function externalTooltip(context: any) {
    const { chart: c, tooltip: t } = context;
    if (!t || t.opacity === 0 || !c || !canvas) {
      tooltip?.destroy();
      tooltip = null;
      return;
    }

    const idx = t.dataPoints?.[0]?.dataIndex ?? 0;
    const label = labels[idx] ?? '';
    const dps = t.dataPoints ?? [];

    let body = '';
    for (const dp of dps) {
      const ds = dp.dataset;
      const v  = dp.parsed.y ?? 0;
      body += `
        <div style="display: flex; align-items: center; gap: 8px; margin-top: 4px;">
          <span style="display: inline-block; width: 8px; height: 8px; border-radius: 99px; background: ${ds.borderColor};"></span>
          <span style="color: var(--text-3); font-size: 11.5px; flex: 1;">${ds.label}</span>
          <span style="color: var(--text); font-weight: 600; font-size: 12.5px;">${tooltipFmt(v)}</span>
        </div>`;
    }

    const html = `
      <div style="color: var(--text-3); font-size: 10.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 2px;">${label}</div>
      ${body}
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

  function buildConfig(): ChartConfiguration<'line'> {
    const text3  = css('--text-3');
    const border = css('--border');

    return {
      type: 'line',
      data: {
        labels,
        datasets: datasets.map((ds, i) => {
          const color = resolveColor(ds.color ?? (i === 0 ? 'var(--primary)' : 'var(--text-3)'));
          // Build a vertical gradient that fades to transparent at the bottom
          const ctx2d = canvas?.getContext('2d');
          let bg: string | CanvasGradient = color + '22';
          if (ctx2d) {
            const grad = ctx2d.createLinearGradient(0, 0, 0, 220);
            grad.addColorStop(0, color + '40');
            grad.addColorStop(0.5, color + '18');
            grad.addColorStop(1, color + '00');
            bg = grad;
          }
          return {
            label: ds.label,
            data: ds.data,
            borderColor: color,
            backgroundColor: bg,
            fill: i === 0 ? 'origin' : false,
            tension: 0.38,
            pointRadius: 0,
            pointHoverRadius: 5,
            pointBackgroundColor: color,
            pointBorderColor: '#fff',
            pointBorderWidth: 2,
            borderWidth: 2.25,
            borderDash: ds.dashed ? [4, 4] : undefined,
          };
        }),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 800, easing: 'easeOutQuart' },
        interaction: { mode: 'index', intersect: false },
        layout: { padding: { top: 16, right: 8, bottom: 4, left: 0 } },
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
            display: true,
            beginAtZero: true,
            grid:  { color: border + '40', lineWidth: 1, drawTicks: false },
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
            border: { display: false },
            ticks: {
              color: text3,
              font:  { size: 10.5, weight: 500 },
              padding: 4,
              maxRotation: 0,
              autoSkipPadding: 14,
            },
          },
        },
      },
    };
  }

  function resolveColor(c: string): string {
    const m = c.match(/^var\((--[^)]+)\)$/);
    return m ? css(m[1]) : c;
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
    if (!chart) return;
    const _data   = datasets;
    const _labels = labels;
    chart.data.labels = _labels;
    chart.data.datasets.forEach((d, i) => {
      if (_data[i]) {
        d.data = _data[i].data;
        d.label = _data[i].label;
      }
    });
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