<script lang="ts">
  import type { Snippet } from 'svelte';
  import DynamicIcon from './DynamicIcon.svelte';

  let {
    icon     = 'Package',
    title    = 'Nothing here',
    message  = '',
    class: cls = '',
    action,
  }: {
    icon?:    string;
    title?:   string;
    message?: string;
    class?:   string;
    action?:  Snippet;
  } = $props();
</script>

<div class="flex flex-col items-center justify-center py-16 text-center {cls}">
  <div class="w-12 h-12 rounded-full bg-[var(--surface2)] flex items-center justify-center mb-4">
    <DynamicIcon name={icon} size={24} class="text-[var(--text-3)]" />
  </div>
  <p class="font-semibold text-sm text-[var(--text)]">{title}</p>
  {#if message}
    <p class="text-xs text-[var(--text-3)] mt-1 max-w-[260px]">{message}</p>
  {/if}
  {#if action}
    <div class="mt-4">{@render action()}</div>
  {/if}
</div>
