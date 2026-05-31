<script lang="ts">
  import { fly } from 'svelte/transition';
  import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-svelte';
  import { toasts, type Toast } from '$lib/stores/toast.svelte';

  const ICONS = { success: CheckCircle2, error: AlertCircle, warning: AlertTriangle, info: Info };
  const COLORS = {
    success: 'var(--teal)',
    error:   'var(--crimson)',
    warning: 'var(--gold)',
    info:    'var(--cobalt)',
  };
</script>

<div class="fixed bottom-24 md:bottom-5 right-4 z-[200] flex flex-col gap-2 items-end">
  {#each toasts.items as toast (toast.id)}
    <div
      class="flex items-start gap-3 bg-[var(--surface)] border border-[var(--border)] rounded-[10px] p-3 pr-2 shadow-[var(--shadow)] max-w-[340px] min-w-[240px]"
      transition:fly={{ x: 60, duration: 220 }}
    >
      <svelte:component
        this={ICONS[toast.variant]}
        size={16}
        strokeWidth={1.75}
        style="color:{COLORS[toast.variant]};flex-shrink:0;margin-top:1px"
      />
      <p class="text-xs leading-5 flex-1">{toast.message}</p>
      <button
        class="btn btn-ghost btn-icon btn-sm"
        style="padding:2px"
        onclick={() => toasts.dismiss(toast.id)}
        aria-label="Dismiss"
      >
        <X size={13} strokeWidth={2} />
      </button>
    </div>
  {/each}
</div>
