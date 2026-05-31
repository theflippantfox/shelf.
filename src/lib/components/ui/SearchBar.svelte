<script lang="ts">
  import { Search, X } from 'lucide-svelte';

  let {
    value       = $bindable(''),
    placeholder = 'Search…',
    class: cls  = '',
    oninput,
  }: {
    value?:       string;
    placeholder?: string;
    class?:       string;
    oninput?:     (v: string) => void;
  } = $props();

  let timer: ReturnType<typeof setTimeout>;

  function handleInput(e: Event) {
    clearTimeout(timer);
    const v = (e.target as HTMLInputElement).value;
    value = v;
    timer = setTimeout(() => oninput?.(v), 300);
  }
</script>

<div class="relative {cls}">
  <Search size={14} strokeWidth={1.75} class="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-3)] pointer-events-none" />
  <input
    type="search"
    bind:value
    {placeholder}
    class="input pl-8 pr-8 text-sm"
    oninput={handleInput}
    enterkeyhint="search"
  />
  {#if value}
    <button
      class="absolute right-2 top-1/2 -translate-y-1/2 btn btn-ghost btn-icon btn-sm p-0.5"
      onclick={() => { value = ''; oninput?.(''); }}
      aria-label="Clear"
    >
      <X size={13} strokeWidth={2} />
    </button>
  {/if}
</div>
