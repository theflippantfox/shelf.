export interface Palette {
  name: string;
  primary: string;
  sidebarBg: string;
  description: string;
}

export const PALETTES: Palette[] = [
  { name: 'Velvet Plum', primary: '#7B4F8A', sidebarBg: '#150F1C', description: 'Luxury beauty' },
  { name: 'Forest & Linen', primary: '#1C7A52', sidebarBg: '#0F1A14', description: 'Natural, organic' },
  { name: 'Ocean Cobalt', primary: '#2E5FC7', sidebarBg: '#0D1428', description: 'Clean, modern' },
  { name: 'Terracotta', primary: '#B85430', sidebarBg: '#1C0E08', description: 'Warm, artisan' },
  { name: 'Midnight Rose', primary: '#C03868', sidebarBg: '#1A0D14', description: 'Bold, feminine' },
  { name: 'Slate', primary: '#4A5568', sidebarBg: '#0F1114', description: 'Minimal, neutral' },
];

export const CATEGORY_COLORS = [
  '#7B4F8A', '#2E5FC7', '#1C7A52', '#C5930A',
  '#C03868', '#B85430', '#0D7A6E', '#4A5568',
  '#8B6914', '#6B21A8',
];

export const DEFAULT_PALETTE = PALETTES[0];
