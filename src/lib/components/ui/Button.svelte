<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    variant  = 'primary',
    size     = 'md',
    disabled = false,
    loading  = false,
    type     = 'button',
    href,
    class: cls = '',
    onclick,
    children,
  }: {
    variant?:  'primary' | 'secondary' | 'ghost' | 'danger';
    size?:     'sm' | 'md' | 'lg' | 'icon';
    disabled?: boolean;
    loading?:  boolean;
    type?:     'button' | 'submit';
    href?:     string;
    class?:    string;
    onclick?:  () => void;
    children?: Snippet;
  } = $props();

  const cls_map = {
    primary:   'btn-primary',
    secondary: 'btn-secondary',
    ghost:     'btn-ghost',
    danger:    'btn-danger',
  };
  const size_map = {
    sm:   'btn-sm',
    md:   '',
    lg:   'btn-lg',
    icon: 'btn-icon',
  };

  const classes = $derived(
    `btn ${cls_map[variant]} ${size_map[size]} ${cls}`
  );
</script>

{#if href}
  <a {href} class={classes} aria-disabled={disabled}>
    {@render children?.()}
  </a>
{:else}
  <button
    {type}
    class={classes}
    disabled={disabled || loading}
    {onclick}
    aria-busy={loading}
  >
    {#if loading}
      <svg class="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
      </svg>
    {/if}
    {@render children?.()}
  </button>
{/if}
