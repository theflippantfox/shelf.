/**
 * Theme store — plain JS, no runes.
 *
 * Why plain JS and not `$state`: the rune form (`let _mode = $state(...)`)
 * only works reliably inside `.svelte` files.  Inside a `.ts` module the
 * rune compiles, but the resulting reactive proxy doesn't propagate to
 * every component that imports the module — each importer can end up
 * with its own snapshot.  The previous version of this file used runes
 * and the result was subtle: the layout's `$effect.pre` and the
 * settings page's `applyShopPalette()` ended up writing to different
 * instances, so the live preview on /settings/appearance silently
 * no-op'd.
 *
 * The fix is to treat the theme like a vanilla event emitter:
 *   - State is held in plain `let` variables.
 *   - DOM updates happen in one place (`_applyToDom`).
 *   - Components that care about a value read it via getters
 *     (`theme.mode`, `theme.isDark`, `theme.paletteId`).
 *   - The DOM is the source of truth for "what the user sees right now";
 *     localStorage persists the choice across reloads.
 */

import { applyTokens } from '$lib/utils/colorUtils';
import { getPalette, PALETTES, type Palette, DEFAULT_PALETTE } from '$lib/config/palettes';

let _mode: 'light' | 'dark' | 'system' = 'system';
let _paletteId: string = DEFAULT_PALETTE.id;
let _transitionTimer: ReturnType<typeof setTimeout> | null = null;
let _subscribed = false;

function _isDark(): boolean {
  if (_mode === 'dark')  return true;
  if (_mode === 'light') return false;
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/**
 * Single source of truth for "what does the page look like right now".
 * Reads `_mode` + `_paletteId` and writes CSS variables + the .dark
 * class on <html>.  Idempotent — safe to call multiple times.
 */
function _applyToDom(): void {
  if (typeof document === 'undefined') return;

  const isDark = _isDark();
  document.documentElement.classList.toggle('dark', isDark);

  const p = getPalette(_paletteId);
  if (!p) return;
  applyTokens(isDark ? p.dark : p.light);

  // Pulse the transition class so the change animates.  Skipped on the
  // very first apply (SSR → hydration) so the page doesn't flash.
  if (_skipNextPulse) {
    _skipNextPulse = false;
    return;
  }
  if (_transitionTimer) clearTimeout(_transitionTimer);
  document.documentElement.classList.add('palette-transitioning');
  _transitionTimer = setTimeout(() => {
    document.documentElement.classList.remove('palette-transitioning');
    _transitionTimer = null;
  }, 280);
}

let _skipNextPulse = true;

/**
 * Wire up the system-colour-scheme listener so a `theme: 'system'` user
 * sees the app flip when their OS preference changes (e.g. night shift).
 * Called lazily by `init()` — safe to call multiple times.
 */
function _subscribeToSystemTheme(): void {
  if (_subscribed || typeof window === 'undefined') return;
  _subscribed = true;
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  // Modern API: addEventListener; old API: addListener.  Cover both.
  if (mq.addEventListener) {
    mq.addEventListener('change', _applyToDom);
  } else if ((mq as any).addListener) {
    (mq as any).addListener(_applyToDom);
  }
}

export const theme = {
  /** Current mode ('light' | 'dark' | 'system'). */
  get mode()      { return _mode; },
  /** True if the rendered theme is dark right now. */
  get isDark()    { return _isDark(); },
  /** Current palette id (e.g. 'graphite-mint'). */
  get paletteId() { return _paletteId; },
  /** Current palette object (light + dark tokens). */
  get palette():  Palette { return getPalette(_paletteId); },

  /**
   * One-time bootstrap from server data.  Idempotent — calling more
   * than once is a no-op visually (the DOM is already in sync).
   */
  init(mode: 'light' | 'dark' | 'system', paletteId?: string) {
    _mode = mode;
    if (paletteId) _paletteId = paletteId;
    _subscribeToSystemTheme();
    _applyToDom();
  },

  /**
   * Change the theme mode (light/dark/system) and persist to localStorage.
   * Updates the DOM immediately.  No save, no DB write.
   */
  setMode(mode: 'light' | 'dark' | 'system') {
    if (_mode === mode) return;
    _mode = mode;
    if (typeof localStorage !== 'undefined') {
      try { localStorage.setItem('shelf-theme', mode); } catch {}
    }
    _applyToDom();
  },

  /**
   * Change the palette and apply it immediately.  No save, no DB write.
   * Pass the palette id (e.g. 'graphite-mint').
   */
  setPalette(paletteId: string) {
    if (_paletteId === paletteId) return;
    const matched = PALETTES.find((p) => p.id === paletteId);
    if (!matched) return;
    _paletteId = matched.id;
    _applyToDom();
  },

  /**
   * Persist the current visual state (mode + palette) to the server.
   * Returns true on success.  Used by /settings/appearance's Save button
   * and by /onboarding/appearance's Continue button.
   */
  async persist(): Promise<boolean> {
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ palette_id: _paletteId, theme: _mode }),
      });
      return res.ok;
    } catch {
      return false;
    }
  },
};
