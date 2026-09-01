<script lang="ts">
  /**
   * QtyInput — a quantity field that doubles as a click-to-edit numeric input.
   *
   * - Click the number (or press Enter / F2 when focused) to start editing
   * - Type any number; the field is controlled and updates the parent
   *   immediately so the total recalculates in real time
   * - Enter or blur commits
   * - Esc cancels and reverts to the last committed value
   * - Arrow up / Arrow down adjust by 1 (Shift+Arrow by 10)
   * - Empty input on blur reverts to the last committed value
   * - The value is clamped to [1, max] on commit
   * - Disabled (read-only) state used when there's no stock
   */
  let {
    value,
    max,
    onChange,
    disabled = false,
  }: {
    value:      number;
    max:        number;
    onChange:   (qty: number) => void;
    disabled?:  boolean;
  } = $props();

  let editing   = $state(false);
  let draft     = $state('');
  let inputEl:  HTMLInputElement | null = $state(null);

  // Keep the draft in sync with the bound value when not editing.
  // (If we don't, the input would show stale text after a setQty(0)
  // from the cart removes the line, or after a maxQty change.)
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
      else draft = String(value); // reset visible text to current value
    } else {
      // Empty / non-positive / NaN — revert.
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
    // Defer focus+select until after the input renders
    queueMicrotask(() => {
      inputEl?.focus();
      inputEl?.select();
    });
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
    class="qty-input"
  />
{:else}
  <button
    type="button"
    class="qty-display"
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
  /* Hide the spinner buttons on Firefox + WebKit — the +/- buttons
   * in the cart row already handle increment, and stripping the
   * spinner keeps the field looking like a clean number. */
  .qty-input::-webkit-outer-spin-button,
  .qty-input::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
  .qty-input {
    -moz-appearance: textfield;
    appearance: textfield;
  }
</style>
