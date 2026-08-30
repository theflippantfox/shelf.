<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { formatCompact } from '$lib/utils/format';
  import type { Chart as ChartType, ChartConfiguration } from 'chart.js';

  let {
    values    = [],
    labels    = [],
    colors    = [
      'var(--primary)',
      'var(--cobalt)',
      'var(--gold)',
      'var(--rose)',
      'var(--crimson)',
      'var(--teal)',
    ],
    height    = 200,
    centerLabel   = '',
    centerSub     = '',
    yFormat   = 'currency',
  }: {
    values?:       number[];
    labels?:       string[];
    colors?:       string[];
    height?:       number | string;
    centerLabel?:  string;
    centerSub?:    string;
    yFormat?:      'currency' | 'number' | 'count';
  } = $props();

  let canvas: HTMLCanvasElement;
  let chart:  ChartType | null = null;
  let observer: MutationObserver;
  let ChartCtor: typeof ChartType | null = null;

  function css(name: string): string {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function resolveColors(cs: string[]): string[] {
    return cs.map((c) => {
      const m = c.match(/^var\((--[^)]+)\)$/);
      return m ? css(m[1]) : c;
    });
  }

  function px(h: number | string): string {
    return typeof h === 'number' ? `${h}px` : h;
  }

  function fmt(n: number): string {
    if (yFormat !== 'number') return '₹' + n.toLocaleString('en-IN');
    return formatCompact(n);
  }

  function buildConfig(): ChartConfiguration<'doughnut'> {
    const text3   = css('--text-3');
    const border  = css('--border');
    const surface = css('--surface');
    const text    = css('--text');
    const text2   = css('--text-2');

    return {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data: values,
          backgroundColor: resolveColors(colors).slice(0, values.length),
          hoverOffset: 6,
          borderColor: surface,
          borderWidth: 3,
          spacing: 2,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '72%',
        animation: { duration: 600, easing: 'easeOutQuart', animateRotate: true, animateScale: true },
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
            displayColors:   true,
            boxPadding:      6,
            callbacks: {
              label: (ctx) => `  ${ctx.label ?? ''}: ${fmt(ctx.parsed ?? 0)}`,
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
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
  });

  $effect(() => {
    const _values = values;
    const _labels = labels;
    const _colors = colors;
    if (!chart) return;

    chart.data.labels = _labels;
    chart.data.datasets[0].data            = _values;
    chart.data.datasets[0].backgroundColor = resolveColors(_colors).slice(0, _values.length);

    chart.update('active');
  });

  onDestroy(() => {
    chart?.destroy();
    observer?.disconnect();
  });
</script>

<div class="relative" style="height: {px(height)};">
  <canvas bind:this={canvas}></canvas>
  {#if centerLabel || centerSub}
    <div class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
      {#if centerLabel}
        <p class="text-base font-bold tabular-nums">{centerLabel}</p>
      {/if}
      {#if centerSub}
        <p class="text-[10px] uppercase tracking-wide font-semibold text-[var(--text-3)] mt-0.5">{centerSub}</p>
      {/if}
    </div>
  {/if}
</div>