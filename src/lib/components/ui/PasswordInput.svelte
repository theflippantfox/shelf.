<script lang="ts">
  import type { HTMLInputAttributes } from 'svelte/elements';
  import { Eye, EyeOff } from 'lucide-svelte';

  let {
    label,
    value       = $bindable(''),
    placeholder = '',
    hint,
    error,
    disabled    = false,
    required    = false,
    class: cls  = '',
    id,
    oninput,
    onchange,
    ...rest
  }: HTMLInputAttributes & {
    label?:       string;
    value?:       string;
    placeholder?: string;
    hint?:        string;
    error?:       string;
    disabled?:    boolean;
    required?:    boolean;
    class?:       string;
    id?:          string;
  } = $props();

  const inputId = $derived(id ?? `pwd-${Math.random().toString(36).slice(2)}`);
  let visible  = $state(false);
</script>

<div class="input-group {cls}">
  {#if label}
    <label for={inputId} class="input-label">
      {label}{#if required}<span class="text-[var(--crimson-fg)] ml-0.5">*</span>{/if}
    </label>
  {/if}
  <div class="relative">
    <input
      type={visible ? 'text' : 'password'}
      id={inputId}
      bind:value
      {placeholder}
      {disabled}
      {required}
      class="input pr-10 {error ? 'input-error' : ''} ring-focus"
      {oninput}
      {onchange}
      autocomplete="current-password"
      {...rest}
    />
    <button
      type="button"
      onclick={() => (visible = !visible)}
      class="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-md flex items-center justify-center text-[var(--text-3)] hover:text-[var(--text)] hover:bg-[var(--surface2)] transition-colors"
      tabindex="-1"
      aria-label={visible ? 'Hide password' : 'Show password'}
      aria-pressed={visible}
    >
      {#if visible}
        <EyeOff size={14} strokeWidth={1.75} />
      {:else}
        <Eye size={14} strokeWidth={1.75} />
      {/if}
    </button>
  </div>
  {#if error}
    <p class="input-error-msg">{error}</p>
  {:else if hint}
    <p class="input-hint">{hint}</p>
  {/if}
</div>
