<script lang="ts">
  import type { Snippet } from 'svelte';
  import DynamicIcon from './DynamicIcon.svelte';

  let {
    label,
    value,
    sub,
    icon,
    iconColor = 'var(--primary)',
    trend,
    class: cls = '',
  }: {
    label:      string;
    value:      string;
    sub?:       string;
    icon?:      string;
    iconColor?: string;
    trend?:     { direction: 'up' | 'down' | 'flat'; label: string };
    class?:     string;
  } = $props();

  const trendColor = $derived(
    trend?.direction === 'up'   ? 'var(--teal-fg)'    :
    trend?.direction === 'down' ? 'var(--crimson-fg)' :
    'var(--text-3)'
  );
</script>

<div class="kpi-card {cls}">
  <div class="flex items-start justify-between gap-2">
    <p class="kpi-label">{label}</p>
    {#if icon}
      <div class="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
           style="background:color-mix(in srgb,{iconColor} 12%,transparent)">
        <DynamicIcon name={icon} size={14} style="color:{iconColor}" />
      </div>
    {/if}
  </div>
  <p class="kpi-value">{value}</p>
  <div class="flex items-center gap-2">
    {#if sub}<p class="kpi-sub">{sub}</p>{/if}
    {#if trend}
      <span class="text-xs font-semibold" style="color:{trendColor}">
        {trend.direction === 'up' ? '↑' : trend.direction === 'down' ? '↓' : '–'} {trend.label}
      </span>
    {/if}
  </div>
</div>
