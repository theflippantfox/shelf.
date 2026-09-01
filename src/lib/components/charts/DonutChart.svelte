<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { Chart as ChartType, ChartConfiguration } from 'chart.js';

  /**
   * DonutChart — premium donut for breakdowns (payment methods, etc.).
   * Center label is rendered as HTML overlay (not on the canvas).
   */
  let {
    data    = [],
    labels  = [],
    colors  = ['var(--primary)', 'var(--teal)', 'var(--gold)', 'var(--cobalt)', 'var(--crimson)'],
    height  = 220,
    centerLabel = '',
    centerValue = '',
  }: {
    data?:         number[];
    labels?:       string[];
    colors?:       string[];
    height?:       number | string;
    centerLabel?:  string;
    centerValue?:  string;
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

  function buildConfig(): ChartConfiguration<'doughnut'> {
    const text2 = css('--text-2');
    return {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: colors.map(c => resolveColor(c)),
          borderColor: css('--surface'),
          borderWidth: 3,
          hoverOffset: 6,
          spacing: 2,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '70%',
        animation: { duration: 800, easing: 'easeOutQuart' },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: css('--surface'),
            borderColor: css('--border'),
            borderWidth: 1,
            titleColor: css('--text'),
            bodyColor: text2,
            padding: { top: 8, bottom: 8, left: 12, right: 12 },
            cornerRadius: 8,
            titleFont: { size: 11, weight: 600 },
            bodyFont:  { size: 11, weight: 500 },
            displayColors: true,
            boxPadding: 4,
            callbacks: {
              label: (ctx) => {
                const v = ctx.parsed ?? 0;
                const total = (ctx.dataset.data as number[]).reduce((s, x) => s + (x ?? 0), 0);
                const pct = total > 0 ? ((v / total) * 100).toFixed(1) : '0';
                return ` ${ctx.label}: ${v.toLocaleString()} (${pct}%)`;
              },
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
    if (!chart) return;
    chart.data.labels = labels;
    chart.data.datasets[0].data = data;
    chart.update('active');
  });

  onDestroy(() => {
    chart?.destroy();
    observer?.disconnect();
  });
</script>

<div class="relative" style="height: {px(height)};">
  <canvas bind:this={canvas}></canvas>
  {#if centerLabel || centerValue}
    <div class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
      {#if centerValue}
        <span class="display-sm tabular text-[var(--text)]">{centerValue}</span>
      {/if}
      {#if centerLabel}
        <span class="text-[11px] uppercase tracking-wide text-[var(--text-3)] font-semibold mt-0.5">{centerLabel}</span>
      {/if}
    </div>
  {/if}
</div>