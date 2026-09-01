<script lang="ts">
  import { fly, fade } from 'svelte/transition';
  import { X } from 'lucide-svelte';
  import type { Snippet } from 'svelte';

  /**
   * Modal — centered dialog for cases where a bottom sheet on mobile
   * is wrong (small dialogs, destructive confirms, full-page takeovers).
   *
   * For new code, prefer Sheet.svelte unless the content is small enough
   * to be a comfortable centered card on mobile too.
   */
  let {
    open      = $bindable(false),
    title     = '',
    description = '',
    maxWidth  = 'max-w-lg',
    children,
    footer,
  }: {
    open?:         boolean;
    title?:        string;
    description?:  string;
    maxWidth?:     string;
    children?:     Snippet;
    footer?:       Snippet;
  } = $props();

  let dialogEl = $state<HTMLElement | null>(null);

  $effect(() => {
    if (open && dialogEl) {
      const first = dialogEl.querySelector<HTMLElement>(
        'input, button:not([aria-label="Close"]), select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      first?.focus();
    }
  });

  function close() { open = false; }
  function handleOverlayClick(e: MouseEvent) {
    if (e.target === e.currentTarget) close();
  }
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape' && open) close(); }} />

{#if open}
  <div
    class="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]"
    transition:fade={{ duration: 200 }}
    onclick={handleOverlayClick}
    onkeydown={(e) => { if (e.key === 'Escape' && open) close(); }}
    role="presentation"
  ></div>

  <div
    class="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4"
    role="dialog"
    aria-modal="true"
    aria-label={title}
  >
    <div
      bind:this={dialogEl}
      class="surface-elevated w-full {maxWidth} flex flex-col max-h-[90vh] overflow-hidden md:rounded-[18px] rounded-t-[20px]"
      transition:fly={{ y: 20, duration: 240 }}
    >
      <div class="flex items-start justify-between gap-3 px-6 pt-5 pb-3 shrink-0">
        <div class="min-w-0">
          <h2 class="text-[15px] font-semibold text-[var(--text)] tracking-tight">{title}</h2>
          {#if description}
            <p class="text-[12.5px] text-[var(--text-3)] mt-0.5">{description}</p>
          {/if}
        </div>
        <button
          class="ring-focus anim-press w-8 h-8 rounded-lg flex items-center justify-center text-[var(--text-3)] hover:text-[var(--text)] hover:bg-[var(--surface2)] transition-colors shrink-0"
          onclick={close} aria-label="Close"
        >
          <X size={16} strokeWidth={2} />
        </button>
      </div>

      <div class="flex-1 overflow-y-auto px-6 pb-5">
        {@render children?.()}
      </div>

      {#if footer}
        <div class="px-6 py-3.5 border-t border-[var(--border)] bg-[var(--surface2)]/40 shrink-0">
          {@render footer()}
        </div>
      {/if}
    </div>
  </div>
{/if}