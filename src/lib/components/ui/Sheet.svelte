<script lang="ts">
  import { fly, fade } from 'svelte/transition';
  import { X } from 'lucide-svelte';
  import type { Snippet } from 'svelte';

  /**
   * Sheet — a premium modal that becomes a bottom sheet on mobile.
   *
   * Replaces Modal.svelte. Same API (open bindable, title, footer, children),
   * but with native-feeling motion and a drag handle on mobile.
   *
   * - Desktop: centered, scale+fade in
   * - Mobile:  bottom sheet, slides up, includes drag handle
   */
  let {
    open      = $bindable(false),
    title     = '',
    description = '',
    maxWidth  = 'max-w-lg',
    children,
    footer,
    sheet     = 'auto',  // 'auto' | 'always' | 'never'  — when to use sheet layout
    size      = 'md',    // 'sm' | 'md' | 'lg' | 'xl'   — sheet height (mobile)
  }: {
    open?:         boolean;
    title?:        string;
    description?:  string;
    maxWidth?:     string;
    children?:     Snippet;
    footer?:       Snippet;
    sheet?:        'auto' | 'always' | 'never';
    size?:         'sm' | 'md' | 'lg' | 'xl';
  } = $props();

  let dialogEl = $state<HTMLElement | null>(null);

  const sizeHeight = $derived({
    sm: 'max-h-[40vh]',
    md: 'max-h-[70vh]',
    lg: 'max-h-[88vh]',
    xl: 'max-h-[95vh]',
  }[size]);

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
  <!-- Backdrop -->
  <div
    class="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]"
    transition:fade={{ duration: 200 }}
    onclick={handleOverlayClick}
    onkeydown={(e) => { if (e.key === 'Escape' && open) close(); }}
    role="presentation"
  ></div>

  <!-- Desktop: centered modal -->
  <div
    class="hidden md:flex fixed inset-0 z-50 items-center justify-center p-4 pointer-events-none"
    role="dialog"
    aria-modal="true"
    aria-label={title}
  >
    <div
      bind:this={dialogEl}
      class="surface-elevated pointer-events-auto w-full {maxWidth} flex flex-col max-h-[90vh] overflow-hidden"
      style="border-radius: 18px;"
      transition:fly={{ y: 12, duration: 280, opacity: 0 }}
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

  <!-- Mobile: bottom sheet -->
  <div
    class="md:hidden fixed inset-x-0 bottom-0 z-50 pointer-events-none"
    role="dialog"
    aria-modal="true"
    aria-label={title}
  >
    <div
      bind:this={dialogEl}
      class="surface-elevated pointer-events-auto w-full {sizeHeight} flex flex-col overflow-hidden rounded-t-[20px]"
      style="box-shadow: 0 -8px 32px -8px rgb(0 0 0 / 0.18), 0 -1px 0 0 rgb(255 255 255 / 0.4) inset;"
    >
      <!-- Drag handle -->
      <div class="flex justify-center pt-2.5 pb-1 shrink-0">
        <div class="w-10 h-1 rounded-full bg-[var(--border)]"></div>
      </div>
      <div class="flex items-start justify-between gap-3 px-5 pt-2 pb-3 shrink-0">
        <div class="min-w-0">
          <h2 class="text-[15px] font-semibold text-[var(--text)] tracking-tight">{title}</h2>
          {#if description}
            <p class="text-[12px] text-[var(--text-3)] mt-0.5">{description}</p>
          {/if}
        </div>
        <button
          class="ring-focus anim-press w-8 h-8 rounded-lg flex items-center justify-center text-[var(--text-3)] hover:text-[var(--text)] hover:bg-[var(--surface2)] transition-colors shrink-0"
          onclick={close} aria-label="Close"
        >
          <X size={16} strokeWidth={2} />
        </button>
      </div>
      <div class="flex-1 overflow-y-auto px-5 pb-[max(20px,env(safe-area-inset-bottom))]">
        {@render children?.()}
      </div>
      {#if footer}
        <div class="px-5 py-3.5 border-t border-[var(--border)] bg-[var(--surface2)]/40 shrink-0">
          {@render footer()}
        </div>
      {/if}
    </div>
  </div>
{/if}