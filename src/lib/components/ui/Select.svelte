<script lang="ts">
  let {
    label,
    value     = $bindable(''),
    options   = [],
    hint,
    error,
    disabled  = false,
    required  = false,
    class: cls = '',
    onchange,
  }: {
    label?:   string;
    value?:   string;
    options:  { value: string; label: string }[];
    hint?:    string;
    error?:   string;
    disabled?: boolean;
    required?: boolean;
    class?:   string;
    onchange?: (v: string) => void;
  } = $props();

  const id = `sel-${Math.random().toString(36).slice(2)}`;
</script>

<div class="input-group {cls}">
  {#if label}
    <label for={id} class="input-label">
      {label}{#if required}<span class="text-[var(--crimson-fg)] ml-0.5">*</span>{/if}
    </label>
  {/if}
  <select
    {id}
    bind:value
    {disabled}
    class="input {error ? 'input-error' : ''}"
    onchange={(e) => onchange?.((e.target as HTMLSelectElement).value)}
  >
    {#each options as opt}
      <option value={opt.value}>{opt.label}</option>
    {/each}
  </select>
  {#if error}
    <p class="input-error-msg">{error}</p>
  {:else if hint}
    <p class="input-hint">{hint}</p>
  {/if}
</div>
