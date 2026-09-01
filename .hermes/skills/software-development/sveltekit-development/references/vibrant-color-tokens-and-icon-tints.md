# Vibrant Color Tokens & Icon-Tint Pattern

A reusable design-token recipe for a POS / dashboard app that needs to read as **premium and lively** without going garish. Captured from a session where the user said the app felt "plain and unsaturated" and the icons/text were "dull" against a near-white background.

## The Problem (Default State)

A typical "tasteful" POS palette is too quiet:
- `--text-2: #3F3F46` — mid-gray that fades into a near-white background
- `--text: #FAFAFA` on dark — cool, slightly clinical
- Accents like `#0D8B7D` (teal), `#D42F5F` (crimson), `#D69E0B` (gold), `#2563D4` (cobalt) — all mid-saturation, dusty, "corporate 2018"
- Icons everywhere rendered with `text-[var(--text-3)]` (gray on near-white) — every icon looks the same, nothing pops

Result: the app reads as a Notion clone, not a premium product.

## The Fix — Three Concrete Layers

### Layer 1: Charcoal text + warm offwhite on dark

```css
:root {
  --text:   #0A0A0B;   /* true charcoal on light — was #0B0B0F */
  --text-2: #27272A;   /* near-black, was #3F3F46 — the main culprit */
  --text-3: #71717A;   /* keep this for true placeholders/muted only */
}
html.dark {
  --text:   #F5F4EF;   /* warm offwhite, was #FAFAFA */
  --text-2: #D4D4D8;   /* lifted from #A1A1AA */
  --text-3: #71717A;
}
```

Why the warm offwhite on dark: pure `#FFFFFF` on dark surfaces reads as "blue-cold" on most monitors. `#F5F4EF` has a touch of yellow that feels paper-warm.

### Layer 2: Vibrant accents, light + dark pairs

Define each accent in three roles: base (`-`), tinted background (`-dim`), and foreground text on the tint (`-fg`). Provide a parallel set for dark mode so the same hue family stays readable.

```css
:root {
  --teal:        #00B894;  --teal-dim:    #d3f7ee;  --teal-fg:     #05443d;
  --cobalt:      #2D6BFF;  --cobalt-dim:  #e1ebff;  --cobalt-fg:   #002b99;
  --crimson:     #E53572;  --crimson-dim: #ffe1ec;  --crimson-fg:  #8a0a2e;
  --gold:        #E8A317;  --gold-dim:    #fff3d6;  --gold-fg:     #6b4c00;
  --violet:      #7C4DFF;  --violet-dim:  #ece4ff;  --violet-fg:   #3a1aaa;
  --lime:        #84CC16;  --lime-dim:    #ecfccb;  --lime-fg:     #3a5a08;
}
html.dark {
  --teal:        #2DD4BF;  --teal-fg:     #aaf2e5;
  --cobalt:      #5B8CFF;  --cobalt-fg:   #bcd2ff;
  --crimson:     #FF5A8C;  --crimson-fg:  #ffc4d6;
  --gold:        #F5B73A;  --gold-fg:     #fce6a8;
  --violet:      #9F7BFF;  --violet-fg:   #d4c2ff;
  --lime:        #A3E635;  --lime-fg:     #d8f0a3;
  /* *-dim are the dark-mode deep-tint versions */
  --teal-dim:    #0a2522;
  --cobalt-dim:  #0d1633;
  --crimson-dim: #2d0d18;
  --gold-dim:    #2d2410;
  --violet-dim:  #1a0d33;
  --lime-dim:    #1a2208;
}
```

The `-dim` is what the **icon tint** sits on, and `-fg` is for any text on that tint. The base color is the icon stroke and any standalone text accent.

### Layer 3: Reusable `.icon-tint-*` utility classes

```css
.icon-tint {
  width: 28px; height: 28px;
  border-radius: 8px;
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.icon-tint-sm { width: 22px; height: 22px; border-radius: 6px; }
.icon-tint-lg { width: 36px; height: 36px; border-radius: 10px; }
.icon-tint-cobalt  { background: var(--cobalt-dim);  color: var(--cobalt); }
.icon-tint-teal    { background: var(--teal-dim);    color: var(--teal); }
.icon-tint-gold    { background: var(--gold-dim);    color: var(--gold); }
.icon-tint-crimson { background: var(--crimson-dim); color: var(--crimson); }
.icon-tint-violet  { background: var(--violet-dim);  color: var(--violet); }
.icon-tint-lime    { background: var(--lime-dim);    color: var(--lime); }
.icon-tint-primary { background: var(--primary-dim); color: var(--text); }
```

Usage:
```svelte
<div class="icon-tint icon-tint-cobalt">
  <Package size={14} />
</div>

<!-- Tone derived from data -->
<div class="icon-tint icon-tint-{a.tone}">
  <DynamicIcon name={a.icon} size={16} />
</div>

<!-- Larger for KPI cards -->
<div class="icon-tint icon-tint-lg icon-tint-teal">
  <TrendingUp size={18} />
</div>
```

Pair with vibrant text classes for emphasis only:
```css
.t-cobalt  { color: var(--cobalt); }
.t-teal    { color: var(--teal); }
.t-gold    { color: var(--gold); }
.t-crimson { color: var(--crimson); }
.t-violet  { color: var(--violet); }
.t-lime    { color: var(--lime); }
```

## Decision Rules for Applying Tones

1. **Map semantic meaning to hue once, then reuse.** Pick a canonical mapping and stick to it across the whole app. Don't change the tone of the "sales" icon on different pages.
   - `teal` → positive / growth / sales / money up
   - `cobalt` → primary actions / neutral category (the "default" tint)
   - `crimson` → alerts / errors / destructive
   - `gold` → warnings / taxes / time-based (clock icons)
   - `violet` → secondary / settings / configuration
   - `lime` → success alt / health
   - `primary` → neutral (charcoal on dim)

2. **List rows: cycle tones, don't repeat.** A settings list with 7 entries shouldn't have 4 cobalt entries and 1 crimson. Cycle through the palette so adjacent rows are visually distinct.

3. **Dashboard quick actions: each tile a different tone.** 4 actions in a Quick Actions card → 4 distinct tones. The user can identify the destination by hue, not by reading the label.

4. **Never use the base accent color as a background.** Always pair with the matching `-dim`. Raw `#2D6BFF` as a button background is fine; raw `#2D6BFF` as a row tint is a UX crime.

5. **In dark mode, the same hue family stays readable** because the `-dim` is also defined for dark (deep tint, low luminance). The icon stroke uses the lifted variant (`#5B8CFF` on dark vs `#2D6BFF` on light) so it stays bright enough to read.

## Live Palette Transition (the Animation)

When the user picks a different palette, the whole app should transition over ~240ms instead of snapping. Pattern:

```css
/* app.css — scoped, temporary transition window */
html.palette-transitioning,
html.palette-transitioning *,
html.palette-transitioning *::before,
html.palette-transitioning *::after {
  transition: background-color 240ms ease, color 240ms ease,
              border-color 240ms ease, box-shadow 240ms ease,
              fill 240ms ease, stroke 240ms ease !important;
}
```

```ts
// theme store — pulse the class on each apply
let _skipNextPulse = true;  // skip the very first apply (SSR → hydration)
let _transitionTimer: ReturnType<typeof setTimeout> | null = null;

function _pulseTransition() {
  if (typeof document === 'undefined') return;
  if (_skipNextPulse) { _skipNextPulse = false; return; }  // skip initial paint
  if (_transitionTimer) clearTimeout(_transitionTimer);
  document.documentElement.classList.add('palette-transitioning');
  _transitionTimer = setTimeout(() => {
    document.documentElement.classList.remove('palette-transitioning');
    _transitionTimer = null;
  }, 280);
}
```

Why `_skipNextPulse`: the first call to `_applyPalette()` happens during `theme.init()` in the layout's `$effect.pre` — this is the SSR → hydration handoff. If you pulse there, the whole app animates on initial page load, which feels like a bug. Skip the first pulse; pulse on every subsequent apply (palette click, mode toggle, etc).

**Scope the transition with `!important`** to outrank any per-element `transition: background-color 200ms` that individual components set. The 280ms window is bounded so it can't fight with subsequent hover transitions.

## Apply Pattern in `onboarding/appearance` and `settings/appearance`

Two distinct callers, one shared function:

```ts
// theme.svelte.ts
applyShopPalette(paletteId: string) {
  const matched = PALETTES.find(p => p.id === paletteId);
  if (matched) _paletteId = matched.id;
  _applyPalette();  // updates CSS vars + pulses the transition class
}
```

```svelte
<!-- settings/appearance/+page.svelte — live preview, manual save -->
<button onclick={() => previewPalette(p.id)}>...</button>
{#snippet saveLater()}
  <!-- POST to /api/settings on click of a Save button at the bottom -->
{/snippet}
```

```svelte
<!-- onboarding/appearance/+page.svelte — live preview, save on Continue -->
<button onclick={() => { selectedPalette = p; themeStore.applyShopPalette(p.id); }}>...</button>
<!-- Continue button POSTs the final palette_id to /api/onboarding/appearance -->
```

The legacy anti-pattern was `applyShopPalette(primaryColor: string, sidebarBg: string)` that **ignored its arguments** and just re-applied the current palette. The user picks a new palette → nothing visible happens. If you inherit a theme store that has a similar legacy shim, fix the signature first; live preview is meaningless without it.

## What to Avoid

- **Don't use `var(--text-3)` on icons in card/list contexts.** It's the placeholder gray. Reserve for true tertiary content.
- **Don't make every icon the same tone.** A settings list where every row is `icon-tint-cobalt` defeats the point.
- **Don't use `!important` outside the `palette-transitioning` scope.** It'll fight component-level transitions.
- **Don't skip the dark-mode parallel set.** The lifted variants on dark are what keeps the colors readable; if you only update light mode, the same hex reads as muddy on dark.
- **Don't transition `width`, `height`, `transform` in the `palette-transitioning` rule.** It's only meant for color properties. Width/height transitions during the 280ms window will cause layout flicker on every palette change.
