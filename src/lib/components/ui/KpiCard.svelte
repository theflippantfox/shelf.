<script lang="ts">
  import type { Snippet } from 'svelte';
  import DynamicIcon from './DynamicIcon.svelte';
  import NumberFlow from './NumberFlow.svelte';
  import { getCurrencySymbol } from '$lib/utils/format';

  let {
    label,
    /** Numeric value (in minor units if isCurrency). Will be animated. */
    value,
    sub,
    icon,
    iconColor = 'var(--primary)',
    /** When true, value is divided by 100 and prefixed with currency symbol. */
    isCurrency = false,
    /** Currency symbol used when isCurrency is true. Defaults to the active
     *  shop's currency symbol (read from the format utility). */
    currencySymbol,
    /** Pre-formatted value overrides the number animation. */
    display,
    trend,
    class: cls = '',
  }: {
    label:           string;
    value?:          string | number;
    sub?:            string;
    icon?:           string;
    iconColor?:      string;
    isCurrency?:     boolean;
    currencySymbol?: string;
    display?:        string;
    trend?:          { direction: 'up' | 'down' | 'flat'; label: string };
    class?:          string;
  } = $props();

  // Numeric values get animated; string values are displayed as-is.
  const numericValue = $derived(typeof value === 'number' ? value : null);

  // tone derives the trend color
  const trendTone = $derived(
    trend?.direction === 'up'   ? 'text-pos'  :
    trend?.direction === 'down' ? 'text-neg'  :
    'text-[var(--text-3)]'
  );

  const trendChipClass = $derived(
    trend?.direction === 'up'   ? 'bg-pos' :
    trend?.direction === 'down' ? 'bg-neg' :
    'bg-[var(--surface2)] text-[var(--text-3)]'
  );

  const trendArrow = $derived(
    trend?.direction === 'up'   ? '↑' :
    trend?.direction === 'down' ? '↓' :
    '–'
  );

  const symbol = $derived(currencySymbol ?? getCurrencySymbol());

  const fmt = $derived(
    display
      ? display
      : (isCurrency && value != null)
        ? (n: number) => `${symbol}${Math.round(n / 100).toLocaleString()}`
        : (n: number) => Math.round(n).toLocaleString()
  );
</script>

<div class="surface-card relative p-3.5 md:p-5 overflow-hidden {cls}">
  <!-- Soft brand glow in top-left corner -->
  {#if !cls.includes('no-glow')}
    <div class="absolute -top-12 -left-12 w-40 h-40 rounded-full pointer-events-none opacity-60"
         style="background: radial-gradient(circle, color-mix(in srgb, {iconColor} 18%, transparent) 0%, transparent 70%);">
    </div>
  {/if}

  <div class="relative flex items-start justify-between gap-2 mb-1">
    <p class="eyebrow leading-none truncate flex-1 min-w-0">{label}</p>
    {#if icon}
      <div class="w-6 h-6 md:w-7 md:h-7 rounded-md md:rounded-lg flex items-center justify-center flex-shrink-0"
           style="background:color-mix(in srgb,{iconColor} 14%,transparent)">
        <DynamicIcon name={icon} size={12} class="md:hidden" style="color:{iconColor}" />
        <DynamicIcon name={icon} size={14} class="hidden md:block" style="color:{iconColor}" />
      </div>
    {/if}
  </div>

  <p class="relative display-sm md:display-md tabular text-[var(--text)] leading-tight truncate">
    {#if display != null}
      {display}
    {:else if numericValue != null}
      <NumberFlow value={numericValue} format={fmt as any} />
    {:else if typeof value === 'string'}
      {value}
    {/if}
  </p>

  <div class="relative flex items-center gap-1.5 mt-1.5 min-w-0">
    {#if sub}<p class="text-[11px] text-[var(--text-3)] truncate flex-1 min-w-0">{sub}</p>{/if}
    {#if trend}
      <span class="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1 py-0.5 rounded-md whitespace-nowrap {trendTone} {trendChipClass}">
        <span aria-hidden="true">{trendArrow}</span>
        <span>{trend.label}</span>
      </span>
    {/if}
  </div>
</div>