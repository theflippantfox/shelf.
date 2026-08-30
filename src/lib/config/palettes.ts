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
  // Purple & Pink
  '#7B4F8A', '#9333EA', '#C026D3', '#EC4899', '#F472B6',
  // Blue
  '#2563EB', '#3B82F6', '#0EA5E9', '#06B6D4', '#14B8A6',
  // Green
  '#10B981', '#22C55E', '#84CC16', '#65A30D', '#059669',
  // Yellow & Orange
  '#F59E0B', '#F97316', '#EF4444', '#DC2626', '#EA580C',
  // Red & Crimson
  '#BE123C', '#E11D48', '#F43F5E', '#FB7185', '#C03868',
  // Brown & Earth
  '#92400E', '#B45309', '#D97706', '#78350F', '#B85430',
  // Teal & Cyan
  '#0D9488', '#0E7490', '#0891B2', '#0D7A6E', '#164E63',
  // Gray & Slate
  '#475569', '#64748B', '#94A3B8', '#71717A', '#52525B',
  // Indigo & Violet
  '#4F46E5', '#6366F1', '#7C3AED', '#8B5CF6', '#A855F7',
];

export const DEFAULT_PALETTE = PALETTES[0];
