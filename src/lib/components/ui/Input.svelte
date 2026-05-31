<script lang="ts">
  let {
    label,
    value     = $bindable(''),
    type      = 'text',
    placeholder = '',
    hint,
    error,
    disabled  = false,
    required  = false,
    class: cls = '',
    id,
    oninput,
    onchange,
  }: {
    label?:       string;
    value?:       string;
    type?:        string;
    placeholder?: string;
    hint?:        string;
    error?:       string;
    disabled?:    boolean;
    required?:    boolean;
    class?:       string;
    id?:          string;
    oninput?:     (e: Event) => void;
    onchange?:    (e: Event) => void;
  } = $props();

  const inputId = id ?? `input-${Math.random().toString(36).slice(2)}`;
</script>

<div class="input-group {cls}">
  {#if label}
    <label for={inputId} class="input-label">
      {label}{#if required}<span class="text-[var(--crimson-fg)] ml-0.5">*</span>{/if}
    </label>
  {/if}
  <input
    {type}
    id={inputId}
    bind:value
    {placeholder}
    {disabled}
    {required}
    class="input {error ? 'input-error' : ''}"
    {oninput}
    {onchange}
  />
  {#if error}
    <p class="input-error-msg">{error}</p>
  {:else if hint}
    <p class="input-hint">{hint}</p>
  {/if}
</div>
