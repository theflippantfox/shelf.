import { generateColorScale, applyColorScale } from '$lib/utils/colorUtils';

// Module-level $state — Svelte 5 tracks reads inside components correctly
let _mode = $state<'light' | 'dark' | 'system'>('system');

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

export const theme = {
  get mode()   { return _mode; },
  get isDark() { return _isDark(); },

  init(mode: 'light' | 'dark' | 'system') {
    _mode = mode;
    _apply();
  },

  set(mode: 'light' | 'dark' | 'system') {
    _mode = mode;
    _apply();
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('shelf-theme', mode);
    }
  },

  applyShopPalette(primaryColor: string, sidebarBg: string) {
    if (typeof document === 'undefined') return;
    const scale = generateColorScale(primaryColor);
    // Override auto-derived sidebar with the stored value
    const applied = { ...scale, sidebarBg };
    applyColorScale(applied);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('shelf-primary-color', primaryColor);
      localStorage.setItem('shelf-sidebar-bg', sidebarBg);
    }
  },
};
