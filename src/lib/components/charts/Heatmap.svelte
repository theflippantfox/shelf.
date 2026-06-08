<script lang="ts">
  export let values: number[][] = [];
  export let hours: string[] = Array.from({ length: 24 }, (_, i) => `${i}:00`);
  export let days: string[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  $: maxVal = values.flat().reduce((max, v) => Math.max(max, v), 0) || 1;

  function intensity(value: number): number {
    return Math.max(0.07, (value / maxVal) * 0.85 + 0.15);
  }

  /**
   * Uses color-mix() with var(--primary) so the cells automatically track
   * both theme changes (html.dark) and runtime palette overrides —
   * no JavaScript or MutationObserver needed.
   */
  function cellColor(value: number): string {
    const pct = Math.round(intensity(value) * 100);
    return `color-mix(in srgb, var(--primary) ${pct}%, transparent)`;
  }
</script>

<div class="overflow-x-auto pb-2">
  {#if values.length}
    <div class="grid gap-1">
      {#each days as day, i}
        <div class="flex items-center gap-2">
          <span class="w-8 text-[10px] uppercase font-bold text-[var(--text-3)]">
            {day}
          </span>
          <div class="grid grid-cols-24 gap-1 flex-1">
            {#each values[i] ?? [] as cell, j}
              <div
                class="h-5 w-full rounded-sm transition-all hover:scale-110 hover:bg-[var(--primary)]"
                style="background-color: {cellColor(cell)};"
                title="{days[i]} {hours[j]}: {cell}"
              ></div>
            {/each}
          </div>
        </div>
      {/each}
    </div>
  {:else}
    <div class="text-[11px] text-[var(--text-3)] italic">No data available for this period.</div>
  {/if}
</div>
