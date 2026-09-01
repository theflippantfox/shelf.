<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { Chart as ChartType, ChartConfiguration } from 'chart.js';

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
  let containerEl: HTMLDivElement;
  let tooltipEl: HTMLDivElement | null = null;

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
      const major = n / 100;
      if (Math.abs(major) >= 1_000_000) return '₦' + (major / 1_000_000).toFixed(1) + 'M';
      if (Math.abs(major) >= 1_000)     return '₦' + (major / 1_000).toFixed(1) + 'k';
      return '₦' + major.toLocaleString('en-US', { maximumFractionDigits: 0 });
    }
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'k';
    return String(n);
  }
  function tooltipFmt(n: number): string {
    if (yFormat === 'currency') {
      return '₦' + (n / 100).toLocaleString('en-US', { maximumFractionDigits: 2 });
    }
    return n.toLocaleString('en-US');
  }

  function externalTooltip(context: any) {
    const { tooltip } = context;
    if (tooltipEl) { tooltipEl.remove(); tooltipEl = null; }
    if (!tooltip || tooltip.opacity === 0) return;
    if (!containerEl) return;

    const idx = tooltip.dataPoints?.[0]?.dataIndex ?? 0;
    const label = labels[idx] ?? '';
    const value = data[idx] ?? 0;

    const div = document.createElement('div');
    div.className = 'surface-elevated';
    div.style.cssText = `
      position: absolute;
      left: ${tooltip.caretX + 12}px;
      top: ${tooltip.caretY}px;
      transform: translateY(-50%);
      pointer-events: none;
      padding: 8px 12px;
      border-radius: 10px;
      z-index: 10;
      animation: tooltipIn 160ms cubic-bezier(0.16, 1, 0.3, 1) both;
    `;
    div.innerHTML = `
      <div style="color: var(--text-3); font-size: 10.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 2px;">${label}</div>
      <div style="color: var(--text); font-weight: 600; font-size: 13px;">${tooltipFmt(value)}</div>
    `;
    containerEl.appendChild(div);
    tooltipEl = div;
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
    const style = document.createElement('style');
    style.textContent = `@keyframes tooltipIn { from { opacity: 0; transform: translateY(-50%) translateX(-4px); } to { opacity: 1; transform: translateY(-50%); } }`;
    document.head.appendChild(style);
    const { Chart, registerables } = await import('chart.js');
    Chart.register(...registerables);
    ChartCtor = Chart;
    rebuild();
    observer = new MutationObserver(rebuild);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  });

  $effect(() => {
    if (!chart) return;
    chart.data.labels = labels;
    chart.data.datasets[0].data = data;
    chart.update('active');
  });

  onDestroy(() => {
    tooltipEl?.remove();
    chart?.destroy();
    observer?.disconnect();
  });
</script>

<div bind:this={containerEl} class="relative" style="height: {computedHeight}px;">
  <canvas bind:this={canvas}></canvas>
</div>