import { applyTokens } from '$lib/utils/colorUtils';
import { getPalette, PALETTES, type Palette, DEFAULT_PALETTE } from '$lib/config/palettes';

let _mode = $state<'light' | 'dark' | 'system'>('system');
let _paletteId = $state<string>(DEFAULT_PALETTE.id);
let _transitionTimer: ReturnType<typeof setTimeout> | null = null;

function _isDark(): boolean {
  if (_mode === 'dark')  return true;
  if (_mode === 'light') return false;
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function _apply() {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('dark', _isDark());
}

/**
 * Add a 'palette-transitioning' class to <html> for a brief moment so
 * the CSS animation kicks in. The class enables a 240ms transition on
 * every element's color-related properties, so changing --primary,
 * --bg, etc. animates smoothly across the whole app.
 *
 * Skipped on the very first apply (SSR → hydration) so the page
 * doesn't animate on initial paint.
 */
let _skipNextPulse = true;
function _pulseTransition() {
  if (typeof document === 'undefined') return;
  if (_skipNextPulse) { _skipNextPulse = false; return; }
  if (_transitionTimer) clearTimeout(_transitionTimer);
  document.documentElement.classList.add('palette-transitioning');
  _transitionTimer = setTimeout(() => {
    document.documentElement.classList.remove('palette-transitioning');
    _transitionTimer = null;
  }, 280);
}

function _applyPalette() {
  const p = getPalette(_paletteId);
  applyTokens(_isDark() ? p.dark : p.light);
  _pulseTransition();
}

export const theme = {
  get mode()        { return _mode; },
  get isDark()      { return _isDark(); },
  get paletteId()   { return _paletteId; },
  get palette():    Palette { return getPalette(_paletteId); },

  init(mode: 'light' | 'dark' | 'system', paletteId?: string) {
    _mode = mode;
    if (paletteId) _paletteId = paletteId;
    _apply();
    _applyPalette();
  },

  set(mode: 'light' | 'dark' | 'system') {
    _mode = mode;
    _apply();
    _applyPalette();
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('shelf-theme', mode);
    }
  },

  /** Switch palette live (no DB write) — used by the picker preview. */
  setPaletteLive(paletteId: string) {
    _paletteId = paletteId;
    _applyPalette();
  },

  /** Apply a palette and persist via /api/settings. */
  async setPalette(paletteId: string) {
    _paletteId = paletteId;
    _applyPalette();
    try {
      await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ palette_id: paletteId }),
      });
    } catch { /* network — applied locally already */ }
  },

  /** Apply a palette live (visual only, no DB write).
   * Pass the palette id (e.g. 'graphite-mint').
   */
  applyShopPalette(paletteId: string) {
    const matched = PALETTES.find(p => p.id === paletteId);
    if (matched) _paletteId = matched.id;
    _applyPalette();
  },
};