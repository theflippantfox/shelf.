<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    variant = 'default',          // 'default' | 'elevated' | 'inset' | 'flat' | 'gradient'
    interactive = false,
    padded = true,
    href,
    onclick,
    class: cls = '',
    children,
    ...rest
  }: {
    variant?: 'default' | 'elevated' | 'inset' | 'flat' | 'gradient';
    interactive?: boolean;
    padded?: boolean;
    href?: string;
    onclick?: (e: MouseEvent) => void;
    class?: string;
    children?: Snippet;
    [key: string]: any;
  } = $props();

  const variantClass = {
    default:  'surface-card',
    elevated: 'surface-elevated',
    inset:    'surface-inset',
    flat:     'card-flat',
    gradient: 'surface-card gradient-primary',
  }[variant];

  const classes = $derived(
    `${variantClass} ${interactive ? 'interactive' : ''} ${padded ? 'p-4 md:p-5' : ''} ${cls}`
  );
</script>

{#if href}
  <a {href} class="{classes} ring-focus" {onclick} {...rest}>
    {@render children?.()}
  </a>
{:else if onclick}
  <button type="button" class="{classes} text-left w-full ring-focus" {onclick} {...rest}>
    {@render children?.()}
  </button>
{:else}
  <div class="{classes}" {...rest}>
    {@render children?.()}
  </div>
{/if}