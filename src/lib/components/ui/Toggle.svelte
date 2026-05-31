<script lang="ts">
  let {
    checked  = $bindable(false),
    label,
    disabled = false,
    onchange,
  }: {
    checked?:  boolean;
    label?:    string;
    disabled?: boolean;
    onchange?: (v: boolean) => void;
  } = $props();

  const id = `tog-${Math.random().toString(36).slice(2)}`;
</script>

<label class="flex items-center gap-2 cursor-pointer select-none" for={id}>
  <div class="relative">
    <input
      type="checkbox"
      {id}
      bind:checked
      {disabled}
      class="sr-only"
      onchange={() => onchange?.(checked)}
    />
    <div
      class="w-9 h-5 rounded-full transition-colors duration-200"
      style="background:{checked ? 'var(--primary)' : 'var(--border)'}"
    ></div>
    <div
      class="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200"
      style="transform:translateX({checked ? '16px' : '0px'})"
    ></div>
  </div>
  {#if label}
    <span class="text-sm">{label}</span>
  {/if}
</label>
