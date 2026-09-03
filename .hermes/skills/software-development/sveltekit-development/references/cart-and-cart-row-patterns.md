# Cart Row Patterns — QtyInput, Cart Line UX

Reusable component patterns for cart / cart-like UIs (POS sale screen, purchase order receive, inventory adjustments). Captured from building the Shëlf POS sale page.

## The "click to type" quantity field

**Symptom**: hitting `+` 10 times to add ten of the same item is a bad UX in a fast-paced POS. Users get hand cramps, lose count, and slow down at the register.

**Solution**: a `QtyInput` component that doubles as a click-to-edit numeric input. The number is a static display by default; clicking it (or pressing Enter / F2 / Space when focused) turns it into a real `<input type="number">` with the value pre-selected for fast overtype.

### Behavior matrix

| Action | Result |
|---|---|
| Click the number | Becomes a numeric input, auto-focused, value pre-selected |
| Tab to focus + Enter / F2 / Space | Same as click (keyboard accessible) |
| Type any number | Cart total recalculates in real time (controlled) |
| **Enter** or **blur** | Commits the value, exits edit mode |
| **Esc** | Cancels and reverts to last committed value |
| **↑ / ↓** | Adjusts by 1 (Shift+Arrow by 10) |
| Empty / non-numeric / negative | Reverts to the last committed value on blur |
| Out-of-range (over stock) | Clamped to `[1, maxStock]` on commit |
| Hover | Subtle border hint that the field is clickable |

### Component contract

```ts
// src/lib/components/ui/QtyInput.svelte
let { value, max, onChange, disabled = false }: {
  value:      number;
  max:        number;
  onChange:   (qty: number) => void;
  disabled?:  boolean;
} = $props();
```

`onChange` only fires on commit (Enter / blur / arrow keys), not on every keystroke. The parent store is the single source of truth for the displayed value; the input is a controlled draft until commit. The store's `setQty` should already clamp to `[1, maxQty]`, so the QtyInput's clamp is a belt-and-braces second layer.

### Wiring in a cart row

```svelte
{#each cart.items as item (item.productId)}
  <div class="flex items-center gap-1 bg-[var(--bg)] rounded-lg p-0.5">
    <button class="btn btn-ghost btn-icon btn-sm" aria-label="Decrease"
            onclick={() => cart.setQty(item.productId, item.qty - 1)}>
      <Minus size={12} strokeWidth={2.5} />
    </button>
    <QtyInput
      value={item.qty}
      max={item.maxQty}
      onChange={(q) => cart.setQty(item.productId, q)}
    />
    <button class="btn btn-ghost btn-icon btn-sm disabled:opacity-40"
            disabled={item.qty >= item.maxQty}
            aria-label="Increase"
            onclick={() => cart.setQty(item.productId, item.qty + 1)}>
      <Plus size={12} strokeWidth={2.5} />
    </button>
  </div>
{/each}
```

Keep the `+` / `−` buttons as a backup for single-step changes. The QtyInput is for fast overtype.

### The CSS — strip the spinner arrows

WebKit and Firefox both render spinner arrows on `<input type="number">` by default. Strip them so the field doesn't compete with the `+` / `−` buttons in the cart row:

```css
.qty-input::-webkit-outer-spin-button,
.qty-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
.qty-input {
  -moz-appearance: textfield;
  appearance: textfield;
}
```

### Keep the draft in sync with the bound value when not editing

If the parent changes `value` from outside (a server-driven refetch, a maxQty update, the store's `setQty(0)` removing the line), the QtyInput must reflect that. Pattern:

```ts
let draft = $state('');
$effect(() => {
  if (!editing) draft = String(value);
});
```

Don't initialize `draft = String(value)` directly — Svelte 5 warns that props are captured as initial values. The `$effect` is the correct reactive sync.

### Unit-testable commit math

The commit function is pure — easy to verify with a 10-case test:

```ts
function commit(value, max, draft) {
  const n = parseInt(draft, 10);
  if (Number.isFinite(n) && n > 0) {
    const clamped = Math.min(Math.max(1, n), max);
    return { committed: clamped, draft: String(clamped) };
  }
  return { committed: value, draft: String(value) };
}
```

Cases worth covering:

- type 5 → 5
- type 99 over max 10 → clamped to 10
- type 0 / empty / negative / non-numeric / whitespace → revert
- exact max
- very-large input clamped to max

## Reuse this for

- POS cart line quantity
- Purchase order receive — quantity received per item
- Inventory adjustment — count vs system
- Bulk edit screens (multi-select + apply quantity)
- Anywhere users are staring at a static number and want to type instead of click `+`
