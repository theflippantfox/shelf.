/**
 * Color scale utility — given a palette, apply its tokens to the
 * document root as CSS custom properties.
 *
 * The old version of this file generated HSL-derived scales from a
 * single primary hex. The new palette system carries full token sets,
 * so this is just a flat "apply a Tokens object to :root" mapper.
 *
 * For light mode we set the variables on :root.
 * For dark mode we override them on :root.dark.
 */
import type { Tokens } from '$lib/config/palettes';

export function applyTokens(tokens: Tokens) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.style.setProperty('--bg',             tokens.bg);
  root.style.setProperty('--surface',        tokens.surface);
  root.style.setProperty('--surface2',       tokens.surface2);
  root.style.setProperty('--inset',          tokens.inset);
  root.style.setProperty('--border',         tokens.border);
  root.style.setProperty('--text',           tokens.text);
  root.style.setProperty('--text-2',         tokens.text2);
  root.style.setProperty('--text-3',         tokens.text3);
  root.style.setProperty('--primary',        tokens.primary);
  root.style.setProperty('--primary-dim',    tokens.primaryDim);
  root.style.setProperty('--primary-fg',     tokens.primaryFg);
  root.style.setProperty('--primary-mid',    tokens.primaryMid);
  root.style.setProperty('--sidebar-bg',     tokens.sidebarBg);
  root.style.setProperty('--sidebar-text',   tokens.sidebarText);
  root.style.setProperty('--sidebar-muted',  tokens.sidebarMuted);
  root.style.setProperty('--sidebar-active', tokens.sidebarActive);
  root.style.setProperty('--sidebar-accent', tokens.sidebarAccent);
}

/**
 * Legacy shim — kept so old code that imports `applyColorScale` from
 * this module still compiles. New callers should use `applyTokens`.
 */
export function applyColorScale(_scale: any) {
  /* deprecated — use applyTokens from $lib/stores/theme.svelte.ts */
}

export function generateColorScale(_primaryHex: string) {
  /* deprecated — palette tokens are no longer computed at runtime */
  return {} as any;
}