<script lang="ts">
  let {
    name   = '',
    src,
    size   = 32,
    class: cls = '',
  }: {
    name?:  string;
    src?:   string;
    size?:  number;
    class?: string;
  } = $props();

  const initials = $derived(
    name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
  );
  const style = $derived(`width:${size}px;height:${size}px;font-size:${Math.round(size * 0.38)}px`);
</script>

{#if src}
  <img
    {src}
    alt={name}
    class="rounded-full object-cover flex-shrink-0 {cls}"
    {style}
    loading="lazy"
  />
{:else}
  <div
    class="rounded-full bg-[var(--primary-dim)] text-[var(--primary-fg)] font-semibold flex items-center justify-center flex-shrink-0 {cls}"
    {style}
    aria-label={name}
  >
    {initials}
  </div>
{/if}
