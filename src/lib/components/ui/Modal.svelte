<script lang="ts">
  import { fly, fade } from 'svelte/transition';
  import { X } from 'lucide-svelte';
  import type { Snippet } from 'svelte';

  let {
    open      = $bindable(false),
    title     = '',
    maxWidth  = 'max-w-lg',
    children,
    footer,
  }: {
    open?:     boolean;
    title?:    string;
    maxWidth?: string;
    children?: Snippet;
    footer?:   Snippet;
  } = $props();

  let dialogEl: HTMLElement;

  $effect(() => {
    if (open && dialogEl) {
      const first = dialogEl.querySelector<HTMLElement>(
        'input, button, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      first?.focus();
    }
  });

  function close() { open = false; }
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape' && open) close(); }} />

{#if open}
  <!-- Overlay -->
  <div
    class="fixed inset-0 z-50 bg-black/50"
    transition:fade={{ duration: 180 }}
    onclick={close}
    role="presentation"
  ></div>

  <!-- Panel -->
  <div
    bind:this={dialogEl}
    class="fixed inset-0 z-50 flex items-end md:items-center justify-center p-4"
    role="dialog"
    aria-modal="true"
    aria-label={title}
  >
    <div
      class="card w-full {maxWidth} flex flex-col max-h-[90vh]"
      transition:fly={{ y: 20, duration: 220 }}
      onclick={(e) => e.stopPropagation()}
    >
      <!-- Header -->
      <div class="flex items-center justify-between p-5 pb-4 border-b border-[var(--border)]">
        <h2 class="text-sm font-semibold">{title}</h2>
        <button class="btn btn-ghost btn-icon btn-sm" onclick={close} aria-label="Close">
          <X size={16} strokeWidth={1.75} />
        </button>
      </div>

      <!-- Body -->
      <div class="flex-1 overflow-y-auto p-5">
        {@render children?.()}
      </div>

      <!-- Footer -->
      {#if footer}
        <div class="p-4 border-t border-[var(--border)] bg-[var(--surface2)] rounded-b-[14px]">
          {@render footer()}
        </div>
      {/if}
    </div>
  </div>
{/if}
