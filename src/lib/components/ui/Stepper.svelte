<script lang="ts">
  import { Check } from 'lucide-svelte';

  interface Step {
    /** URL slug of the step (matches the last path segment). */
    slug: string;
    /** Display label, e.g. 'Shop', 'Currency', 'Team'. */
    label: string;
  }

  let {
    steps,
    /** Current step slug (the page we're on). */
    current,
  }: { steps: Step[]; current: string } = $props();

  const currentIdx = $derived(steps.findIndex((s) => s.slug === current));
</script>

<nav
  class="w-full mb-6 select-none"
  aria-label="Onboarding progress"
>
  <ol class="flex items-center justify-between gap-1">
    {#each steps as s, i (s.slug)}
      {@const done   = i < currentIdx}
      {@const active = i === currentIdx}
      {@const last   = i === steps.length - 1}

      <li class="flex flex-col items-center min-w-0 flex-1">
        <div class="flex items-center w-full">
          <!-- Connector line (left) -->
          {#if i > 0}
            <div
              class="flex-1 h-px transition-colors"
              style="background:{done || active ? 'var(--primary)' : 'var(--border)'}"
            ></div>
          {:else}
            <div class="flex-1"></div>
          {/if}

          <!-- Step circle -->
          <div
            class="relative w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold transition-all shrink-0
              {done   ? 'bg-[var(--primary)] text-[var(--primary-fg)]'
              : active ? 'bg-[var(--primary)] text-[var(--primary-fg)] shadow-[0_0_0_3px_color-mix(in_srgb,var(--primary)_22%,transparent)]'
              : 'bg-[var(--surface2)] text-[var(--text-3)] border border-[var(--border)]'}"
            aria-current={active ? 'step' : undefined}
          >
            {#if done}
              <Check size={12} strokeWidth={2.5} />
            {:else}
              {i + 1}
            {/if}
          </div>

          <!-- Connector line (right) -->
          {#if !last}
            <div
              class="flex-1 h-px transition-colors"
              style="background:{done ? 'var(--primary)' : 'var(--border)'}"
            ></div>
          {:else}
            <div class="flex-1"></div>
          {/if}
        </div>

        <span
          class="mt-1.5 text-[10.5px] font-semibold text-center truncate w-full px-0.5
            {active ? 'text-[var(--text)]' : 'text-[var(--text-3)]'}"
        >
          {s.label}
        </span>
      </li>
    {/each}
  </ol>
</nav>
