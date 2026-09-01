-- Add palette_id to shops so each shop can pick one of the curated
-- design palettes. Existing rows get the default ('graphite-mint').

alter table public.shops
  add column if not exists palette_id text
    not null
    default 'graphite-mint'
    check (palette_id in (
      'graphite-mint',
      'ink-gold',
      'mist-violet',
      'ocean-cobalt',
      'forest-linen',
      'rose-clay'
    ));

-- Drop the old single-color customisation; palettes are now the only
-- way to brand the app. Keep the columns for now (data preserved) but
-- stop reading them in the theme store.
-- (primary_color, sidebar_bg are intentionally NOT dropped here; we'll
--  remove them in a later migration once the picker has been live for
--  a while.)
