function hexToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

function hslToHex(h: number, s: number, l: number): string {
  const sl = s / 100, ll = l / 100;
  const a = sl * Math.min(ll, 1 - ll);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = ll - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

export function generateColorScale(primaryHex: string) {
  const [h, s, l] = hexToHsl(primaryHex);
  return {
    primary:           primaryHex,
    primaryDim:        hslToHex(h, Math.min(s, 40), Math.min(l + 42, 96)),
    primaryFg:         hslToHex(h, s, Math.max(l - 28, 12)),
    primaryMid:        hslToHex(h, Math.max(s - 10, 20), Math.min(l + 14, 72)),
    sidebarBg:         hslToHex(h, Math.min(s + 5, 60), Math.max(l - 48, 6)),
    sidebarActiveText: hslToHex(h, Math.max(s - 15, 20), Math.min(l + 30, 80)),
  };
}

export function applyColorScale(scale: ReturnType<typeof generateColorScale>) {
  const root = document.documentElement;
  root.style.setProperty('--primary',              scale.primary);
  root.style.setProperty('--primary-dim',          scale.primaryDim);
  root.style.setProperty('--primary-fg',           scale.primaryFg);
  root.style.setProperty('--primary-mid',          scale.primaryMid);
  root.style.setProperty('--sidebar-bg',           scale.sidebarBg);
  root.style.setProperty('--sidebar-active-text',  scale.sidebarActiveText);
}
