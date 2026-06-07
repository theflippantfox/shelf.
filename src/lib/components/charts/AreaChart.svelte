<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import type {
    Chart as ChartType,
    ChartConfiguration,
    ChartDataset,
  } from "chart.js";

  let {
    labels,
    datasets,
    height = 220,
    fill = true,
  }: {
    labels: string[];
    datasets: ChartDataset<"line", number[]>[];
    height?: number;
    fill?: boolean;
  } = $props();

  let canvas: HTMLCanvasElement;
  let chart: ChartType | null = null;
  let observer: MutationObserver;
  let ChartCtor: typeof ChartType | null = null;

  /** Read a CSS custom property from :root */
  function css(name: string): string {
    return getComputedStyle(document.documentElement)
      .getPropertyValue(name)
      .trim();
  }

  /**
   * If the value is a bare `var(--token)` string, resolve it to the real hex/rgba.
   * Anything else (explicit colour, undefined) passes through unchanged.
   */
  function resolve(color: string | undefined): string | undefined {
    if (!color) return color;
    const m = color.match(/^var\((--[^)]+)\)$/);
    return m ? css(m[1]) : color;
  }

  function buildConfig(): ChartConfiguration<"line"> {
    const primary = css("--primary");
    const text3 = css("--text-3");
    const border = css("--border");
    const surface = css("--surface");
    const text = css("--text");
    const text2 = css("--text-2");

    return {
      type: "line",
      data: {
        labels,
        datasets: datasets.map((ds) => {
          const bc = resolve((ds as any).borderColor);
          const bg = resolve((ds as any).backgroundColor);
          return {
            ...ds,
            borderColor: bc ?? primary,
            backgroundColor: bg ?? (fill ? `${primary}26` : "transparent"),
            fill: (ds as any).fill ?? fill,
            tension: 0.4,
            pointRadius: 2,
            borderWidth: 2,
          };
        }),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 400 },
        plugins: {
          legend: { display: false },
          tooltip: {
            // All four must be resolved — canvas ignores CSS vars
            backgroundColor: surface,
            borderColor: border,
            borderWidth: 1,
            titleColor: text,
            bodyColor: text2,
            padding: 10,
            cornerRadius: 8,
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            grid: { color: border }, // was hardcoded rgba(255,255,255,0.06)
            ticks: { color: text3, font: { size: 10 } },
          },
          x: {
            grid: { display: false },
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
    const { Chart, registerables } = await import("chart.js");
    Chart.register(...registerables);
    ChartCtor = Chart;
    rebuild();

    // Re-build when html.dark is toggled so resolved colours update
    observer = new MutationObserver(rebuild);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
  });

  // Reactive data updates — also re-resolve colours so var() strings never reach canvas
  $effect(() => {
    if (!chart) return;
    const primary = css("--primary");
    chart.data.labels = labels;
    chart.data.datasets = datasets.map((ds: any) => ({
      ...ds,
      borderColor: resolve(ds.borderColor) ?? primary,
      backgroundColor: resolve(ds.backgroundColor) ?? `${primary}26`,
    })) as any;
    chart.update("active");
  });

  onDestroy(() => {
    chart?.destroy();
    observer?.disconnect();
  });
</script>

<div style="height:{height}px; position:relative;">
  <canvas bind:this={canvas}></canvas>
</div>
