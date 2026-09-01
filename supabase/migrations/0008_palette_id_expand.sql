-- Extend the palette_id CHECK constraint to include the six palettes
-- added to the picker (Sandstone, Slate Mono, Sapphire, Sunset Coral,
-- Emerald Noir). Same shape as 0007 — drop & re-add the constraint
-- with the new value list.

alter table public.shops
  drop constraint if exists shops_palette_id_check;

alter table public.shops
  add constraint shops_palette_id_check
    check (palette_id in (
      'graphite-mint',
      'ink-gold',
      'mist-violet',
      'ocean-cobalt',
      'forest-linen',
      'rose-clay',
      'sandstone',
      'slate-mono',
      'sapphire',
      'sunset-coral',
      'emerald-noir'
    ));