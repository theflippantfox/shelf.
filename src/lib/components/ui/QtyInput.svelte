<script lang="ts">
  /**
   * QtyInput — a quantity field that doubles as a click-to-edit numeric input.
   *
   * Variants
   * --------
   *  - 'plain' (default)        bare click-to-edit number, transparent bg.
   *                             Use on neutral surfaces (e.g. cart row on bg).
   *  - 'primary'                sits on a var(--primary) background. The
   *                             text colour flips to var(--primary-fg) so
   *                             it stays readable in both light and dark
   *                             themes (which flip the primary colour).
   *  - 'inset'                  sits on var(--surface) with a subtle border.
   *  - 'compact'                same family as 'primary' but smaller; use
   *                             inside tight product cards. Implies
   *                             'primary' for colouring.
   *
   * Props
   * -----
   *  value, max, onChange, disabled  as before
   *  showSteppers?: boolean          when true, renders - / + buttons on
   *                                  either side of the number. Click any
   *                                  button to nudge by 1. Disabled - or +
   *                                  when at the boundary (1 or max).
   *  size?: 'sm' | 'md'              controls the overall height. 'sm' is
   *                                  for product cards; 'md' is the default
   *                                  and is right for the cart row.
   */
  let {
    value,
    max,
    onChange,
    disabled = false,
    showSteppers = false,
    variant    = 'plain',
    size       = 'md',
  }: {
    value:         number;
    max:           number;
    onChange:      (qty: number) => void;
    disabled?:     boolean;
    showSteppers?: boolean;
    variant?:      'plain' | 'primary' | 'inset' | 'compact';
    size?:         'sm' | 'md';
  } = $props();

  let editing   = $state(false);
  let draft     = $state('');
  let inputEl:  HTMLInputElement | null = $state(null);

  // Keep the draft in sync with the bound value when not editing.
  $effect(() => {
    if (!editing) draft = String(value);
  });

  function commit() {
    editing = false;
    const n = parseInt(draft, 10);
    if (Number.isFinite(n) && n > 0) {
      const clamped = Math.min(Math.max(1, n), max);
      draft = String(clamped);
      if (clamped !== value) onChange(clamped);
      else draft = String(value);
    } else {
      draft = String(value);
    }
  }

  function cancel() {
    editing = false;
    draft = String(value);
  }

  function startEdit() {
    if (disabled) return;
    editing = true;
    queueMicrotask(() => {
      inputEl?.focus();
      inputEl?.select();
    });
  }

  function bump(delta: number) {
    if (disabled) return;
    const next = Math.max(1, Math.min(max, value + delta));
    if (next !== value) onChange(next);
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Enter')      { e.preventDefault(); commit();      }
    else if (e.key === 'Escape'){ e.preventDefault(); cancel();      inputEl?.blur(); }
    else if (e.key === 'ArrowUp')   {
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      const next = Math.min((parseInt(draft, 10) || value) + step, max);
      draft = String(next);
      onChange(next);
    }
    else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      const next = Math.max((parseInt(draft, 10) || value) - step, 1);
      draft = String(next);
      onChange(next);
    }
  }
</script>

{#if showSteppers}
  <!--
    Stepper variant. The wrapper owns the background, the buttons and
    the input share the row equally.  Colours are inherited from the
    parent (which is `var(--primary)` + `var(--primary-fg)` for the
    product-card in-cart pill, and the same scheme in dark mode).
  -->
  <button
    type="button"
    class="qty-stepper qty-stepper-btn"
    aria-label="Decrease quantity"
    onclick={() => bump(-1)}
    {disabled}
    tabindex={disabled ? -1 : 0}
  >
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none"
         stroke="currentColor" stroke-width="2.5"
         stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M5 12h14"/>
    </svg>
  </button>

  {#if editing}
    <input
      bind:this={inputEl}
      bind:value={draft}
      type="number"
      inputmode="numeric"
      min="1"
      {max}
      step="1"
      onclick={(e) => e.stopPropagation()}
      onkeydown={onKey}
      onblur={commit}
      onfocus={(e) => e.currentTarget.select()}
      class="qty-stepper qty-stepper-input"
      aria-label="Quantity"
    />
  {:else}
    <button
      type="button"
      class="qty-stepper qty-stepper-display"
      onclick={startEdit}
      onkeydown={(e) => {
        if (e.key === 'Enter' || e.key === 'F2' || e.key === ' ') {
          e.preventDefault();
          startEdit();
        }
      }}
      aria-label="Quantity. Press Enter to edit, then type a number."
      {disabled}
      tabindex={disabled ? -1 : 0}
    >
      {value}
    </button>
  {/if}

  <button
    type="button"
    class="qty-stepper qty-stepper-btn"
    aria-label="Increase quantity"
    onclick={() => bump(+1)}
    disabled={disabled || value >= max}
    tabindex={(disabled || value >= max) ? -1 : 0}
  >
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none"
         stroke="currentColor" stroke-width="2.5"
         stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M5 12h14"/><path d="M12 5v14"/>
    </svg>
  </button>
{:else if editing}
  <input
    bind:this={inputEl}
    bind:value={draft}
    type="number"
    inputmode="numeric"
    min="1"
    {max}
    step="1"
    onclick={(e) => e.stopPropagation()}
    onkeydown={onKey}
    onblur={commit}
    onfocus={(e) => e.currentTarget.select()}
    class="qty-input"
  />
{:else}
  <button
    type="button"
    class="qty-display"
    class:qty-display-primary={variant === 'primary' || variant === 'compact'}
    class:qty-display-inset={variant === 'inset'}
    class:qty-display-sm={size === 'sm'}
    onclick={startEdit}
    onkeydown={(e) => {
      // Tab focuses the next element; Enter / F2 / Space start editing
      if (e.key === 'Enter' || e.key === 'F2' || e.key === ' ') {
        e.preventDefault();
        startEdit();
      }
    }}
    aria-label="Quantity. Press Enter to edit, then type a number."
    {disabled}
    tabindex={disabled ? -1 : 0}
  >
    {value}
  </button>
{/if}

<style>
  /* ── bare click-to-edit (default 'plain' / 'inset' / 'primary') ─── */
  .qty-display {
    min-width: 28px;
    height: 22px;
    padding: 0 4px;
    border: 1px solid transparent;
    background: transparent;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 700;
    text-align: center;
    color: var(--text);
    font-variant-numeric: tabular-nums;
    cursor: text;
    transition: background-color 120ms ease, border-color 120ms ease;
  }
  .qty-display-sm {
    height: 18px;
    font-size: 11px;
    min-width: 24px;
  }
  .qty-display:hover:not(:disabled) {
    background: var(--surface);
    border-color: var(--border);
  }
  .qty-display:focus-visible {
    outline: none;
    background: var(--surface);
    border-color: var(--primary);
  }
  .qty-display:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
  /* On a coloured primary background the text and hover need to flip. */
  .qty-display-primary {
    color: var(--primary-fg);
  }
  .qty-display-primary:hover:not(:disabled) {
    background: color-mix(in srgb, var(--primary-fg) 12%, transparent);
    border-color: transparent;
  }
  .qty-display-inset {
    background: var(--surface);
    border-color: var(--border);
  }

  /* ── editing input (no stepper) ─────────────────────────────────── */
  .qty-input {
    width: 44px;
    height: 22px;
    padding: 0 4px;
    border: 1px solid var(--primary);
    background: var(--bg);
    border-radius: 6px;
    font-size: 12px;
    font-weight: 700;
    text-align: center;
    color: var(--text);
    font-variant-numeric: tabular-nums;
    outline: none;
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 18%, transparent);
  }
  .qty-input::-webkit-outer-spin-button,
  .qty-input::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
  .qty-input {
    -moz-appearance: textfield;
    appearance: textfield;
  }

  /* ── stepper row (with - / +) ──────────────────────────────────── */
  .qty-stepper {
    flex: 0 0 auto;
    border: 0;
    background: transparent;
    color: inherit;          /* inherit from parent (var(--primary-fg) for the
                              * coloured product-card pill) */
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    cursor: pointer;
    padding: 0;
  }
  .qty-stepper:disabled { opacity: 0.4; cursor: not-allowed; }

  .qty-stepper-btn {
    width: 28px;
    height: 22px;
    border-radius: 6px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: background-color 120ms ease;
  }
  .qty-stepper-btn:hover:not(:disabled) {
    background: color-mix(in srgb, currentColor 14%, transparent);
  }
  .qty-stepper-btn:active:not(:disabled) {
    transform: scale(0.92);
  }

  .qty-stepper-display {
    min-width: 24px;
    height: 22px;
    padding: 0 4px;
    font-size: 12.5px;
    text-align: center;
    border-radius: 5px;
    transition: background-color 120ms ease;
  }
  .qty-stepper-display:hover:not(:disabled) {
    background: color-mix(in srgb, currentColor 12%, transparent);
  }

  .qty-stepper-input {
    width: 36px;
    height: 22px;
    padding: 0 2px;
    border-radius: 5px;
    border: 1px solid color-mix(in srgb, currentColor 50%, transparent);
    background: color-mix(in srgb, currentColor 14%, transparent);
    color: inherit;
    font-size: 12.5px;
    font-weight: 700;
    text-align: center;
    outline: none;
    font-variant-numeric: tabular-nums;
  }
  .qty-stepper-input::-webkit-outer-spin-button,
  .qty-stepper-input::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
  .qty-stepper-input { -moz-appearance: textfield; appearance: textfield; }
</style>
