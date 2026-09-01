<script lang="ts">
  import DynamicIcon from './DynamicIcon.svelte';

  let {
    label,
    value,
    sub,
    icon,
    tone = 'primary',
  }: {
    label:    string;
    value:    string;
    sub?:     string;
    icon:     any;  // lucide component or string name
    tone?:    'primary' | 'cobalt' | 'teal' | 'gold' | 'crimson';
  } = $props();

  // Per-tone icon-chip colours
  const toneMap = {
    primary: 'var(--primary)',
    cobalt:  'var(--cobalt)',
    teal:    'var(--teal)',
    gold:    'var(--gold)',
    crimson: 'var(--crimson)',
  } as const;

  const color = $derived(toneMap[tone]);
</script>

<div class="surface-card relative p-3 overflow-hidden">
  <!-- soft radial glow tinted to the tone -->
  <div class="absolute -top-10 -left-10 w-32 h-32 rounded-full pointer-events-none opacity-50"
       style="background: radial-gradient(circle, color-mix(in srgb, {color} 16%, transparent) 0%, transparent 70%);"></div>

  <div class="relative flex items-center gap-1.5 mb-1 min-w-0">
    <div class="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0"
         style="background: color-mix(in srgb, {color} 14%, transparent); color: {color};">
      {#if typeof icon === 'string'}
        <DynamicIcon name={icon} size={11} />
      {:else}
        {@const Icon = icon}
        <Icon size={11} strokeWidth={2} />
      {/if}
    </div>
    <p class="eyebrow leading-none truncate flex-1 min-w-0">{label}</p>
  </div>
  <p class="relative text-[15px] font-semibold tabular-nums text-[var(--text)] leading-tight truncate">{value}</p>
  {#if sub}
    <p class="relative text-[10.5px] text-[var(--text-3)] mt-0.5 truncate">{sub}</p>
  {/if}
</div>