import { applyTokens } from '$lib/utils/colorUtils';
import { getPalette, type Palette, DEFAULT_PALETTE } from '$lib/config/palettes';

let _mode = $state<'light' | 'dark' | 'system'>('system');
let _paletteId = $state<string>(DEFAULT_PALETTE.id);

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

function _applyPalette() {
  const p = getPalette(_paletteId);
  applyTokens(_isDark() ? p.dark : p.light);
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

  /** Old API retained so existing call-sites keep working. */
  applyShopPalette(_primaryColor: string, _sidebarBg: string) {
    _applyPalette();
  },
};