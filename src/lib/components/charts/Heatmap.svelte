<script lang="ts">
  import { formatCurrency } from '$lib/utils/format';
  /**
   * Heatmap — 7x24 grid showing revenue by day-of-week × hour.
   *
   * Pure CSS grid with brand-tinted cells (color-mix on --primary so it
   * tracks theme and palette changes without JS).
   */
  let {
    values      = [],
    hours       = Array.from({ length: 24 }, (_, i) => `${i}:00`),
    days        = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    showHours   = true,
    format      = 'currency',  // 'currency' | 'number'
    fillHeight  = false,        // when true, cells are taller (h-[36px]
                                // instead of h-[18px]) to match a larger
                                // sibling card.
    minWidth    = 0,            // set >0 to force a minimum inner width
                                // (the wrapper will scroll-x if the parent
                                // is narrower). Default 0 lets the grid
                                // shrink to fit the parent.
  }: {
    values?:      number[][];
    hours?:       string[];
    days?:        string[];
    showHours?:   boolean;
    format?:      'currency' | 'number';
    fillHeight?:  boolean;
    minWidth?:    number;
  } = $props();

  const maxVal = $derived(values.flat().reduce((m, v) => Math.max(m, v), 0) || 1);

  function intensity(value: number): number {
    if (maxVal === 0) return 0;
    return Math.max(0.04, value / maxVal);
  }

  function cellColor(value: number): string {
    const pct = Math.round(intensity(value) * 100);
    return `color-mix(in srgb, var(--primary) ${Math.max(pct, 4)}%, transparent)`;
  }

  function tooltip(value: number, day: string, hour: string): string {
    const formatted = format === 'currency' ? formatCurrency(value) : value.toLocaleString();
    return `${day} ${hour}: ${formatted}`;
  }

  // Show hour labels at 0, 6, 12, 18
  const hourTicks = $derived(
    hours.map((h, i) => ({ label: i % 6 === 0 ? h.replace(':00', '') : '', idx: i })),
  );
</script>

<div class="overflow-x-auto {minWidth ? 'overflow-y-hidden' : 'overflow-y-visible'}">
  {#if values.length}
    <div style="min-width: {minWidth ? `${minWidth}px` : '0'};">
      {#if showHours}
        <div class="flex items-end gap-2 mb-1.5 pl-9">
          <div class="flex-1 relative" style="height:14px">
            {#each hourTicks as t}
              {#if t.label}
                <span
                  class="absolute text-[9px] font-semibold uppercase tracking-wide text-[var(--text-3)] -translate-x-1/2 tabular"
                  style="left:calc({t.idx + 0.5} * (100% / 24))"
                >{t.label}</span>
              {/if}
            {/each}
          </div>
        </div>
      {/if}

      <div class="grid gap-1.5">
        {#each days as day, i}
          <div class="flex items-center gap-2">
            <span class="w-7 text-[10px] uppercase font-bold text-[var(--text-3)] shrink-0 tracking-wider">
              {day}
            </span>
            <div class="grid flex-1 gap-1.5"
                 style="grid-template-columns:repeat(24,minmax(0,1fr))">
              {#each values[i] ?? [] as cell, j}
                <div
                  class="rounded-[2px] transition-colors duration-150 cursor-default
                         hover:ring-1 hover:ring-[var(--primary)]
                         {fillHeight ? 'h-[24px]' : 'h-[14px]'}"
                  style="background-color: {cellColor(cell)};"
                  title={tooltip(cell, days[i], hours[j])}
                ></div>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    </div>
  {:else}
    <div class="text-[11px] text-[var(--text-3)] italic text-center py-6">
      No data available for this period.
    </div>
  {/if}
</div>
