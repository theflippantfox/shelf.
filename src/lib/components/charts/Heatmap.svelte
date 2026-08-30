<script lang="ts">
  let {
    values      = [],
    hours       = Array.from({ length: 24 }, (_, i) => `${i}:00`),
    days        = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    showHours   = true,
  }: {
    values?:    number[][];
    hours?:     string[];
    days?:      string[];
    showHours?: boolean;
  } = $props();

  const maxVal = $derived(
    values.flat().reduce((m, v) => Math.max(m, v), 0) || 1,
  );

  function intensity(value: number): number {
    if (maxVal === 0) return 0.07;
    return Math.max(0.06, (value / maxVal) * 0.94 + 0.06);
  }

  /**
   * Uses color-mix() with var(--primary) so the cells automatically track
   * both theme changes (html.dark) and runtime palette overrides — no JS needed.
   */
  function cellColor(value: number): string {
    const pct = Math.round(intensity(value) * 100);
    return `color-mix(in srgb, var(--primary) ${pct}%, transparent)`;
  }

  /** Show hour labels at 0, 6, 12, 18 for orientation */
  const hourTicks = $derived(
    hours.map((h, i) => ({ label: i % 6 === 0 ? h.replace(':00', '') : '', idx: i })),
  );
</script>

<div class="overflow-x-auto pb-2">
  {#if values.length}
    <div class="min-w-[640px]">
      <!-- Hour axis (top) -->
      {#if showHours}
        <div class="flex items-end gap-2 mb-1">
          <span class="w-8 shrink-0"></span>
          <div class="flex-1 relative" style="height:14px">
            {#each hourTicks as t}
              <span
                class="absolute text-[9px] font-semibold uppercase tracking-wide text-[var(--text-3)] -translate-x-1/2"
                style="left:calc({t.idx + 0.5} * (100% / 24))"
              >{t.label}</span>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Day rows -->
      <div class="grid gap-1">
        {#each days as day, i}
          <div class="flex items-center gap-2">
            <span class="w-8 text-[10px] uppercase font-bold text-[var(--text-3)] shrink-0">
              {day}
            </span>
            <div class="grid flex-1 gap-1" style="grid-template-columns:repeat(24,minmax(0,1fr))">
              {#each values[i] ?? [] as cell, j}
                <div
                  class="h-5 rounded-[3px] transition-all duration-150 cursor-default
                         hover:scale-[1.18] hover:shadow-[0_0_0_1.5px_var(--primary)] hover:z-10 hover:relative"
                  style="background-color: {cellColor(cell)};"
                  title="{days[i]} {hours[j]}: {cell}"
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