#!/usr/bin/env python3
"""One-pass lift of the 6 settings sub-pages to the new design system.

For each page:
  - Replace the (PageShell > back-button + text-sm title) header with
    a full eyebrow + display-md header (no more back-button, no PageShell
    - the page now lives inside (app) layout).
  - Replace `card p-5` form wrappers with `surface-card p-4 md:p-5`.
  - Replace `card p-4`/`card p-3` with surface equivalents.
  - Drop the now-unused `import PageShell` and `import ArrowLeft`.
  - Replace `font-semibold text-sm` (used as headings) with the new
    eyebrow + display treatment.
"""
import re
from pathlib import Path

SETTINGS = Path('/home/theflippantfox/Projects/shelf/src/routes/(app)/settings')

# Map page -> (eyebrow text, display title)
TITLES = {
    'shop':       ('Settings', 'Shop details'),
    'locale':     ('Settings', 'Locale & currency'),
    'taxes':      ('Settings', 'Taxes'),
    'receipt':    ('Settings', 'Receipt'),
    'categories': ('Settings', 'Categories'),
    'team':       ('Settings', 'Team'),
}

def lift(path: Path, eyebrow: str, title: str):
    src = path.read_text()

    # 1) Drop PageShell import + the import ArrowLeft line.
    src = re.sub(r"^\s*import PageShell from .*?;\n", "", src, flags=re.M)
    src = re.sub(r"^\s*import \{ ArrowLeft \} from .*?;\n", "", src, flags=re.M)

    # 2) Replace <PageShell>\n ... old header block ... with the new header.
    #    The old pattern is:
    #      <PageShell>
    #        <div class="flex items-center gap-3 mb-5">
    #          <a href="/settings" class="btn btn-ghost btn-icon btn-sm"><ArrowLeft size=... /></a>
    #          <p class="font-semibold text-sm">{title}</p>
    #        </div>
    new_header = (
        f'<header class="flex items-end justify-between gap-3 mb-5">\n'
        f'  <div class="min-w-0">\n'
        f'    <p class="eyebrow">{eyebrow}</p>\n'
        f'    <h1 class="text-[22px] md:text-[26px] font-semibold text-[var(--text)] tracking-tight mt-0.5">{title}</h1>\n'
        f'  </div>\n'
        f'</header>\n'
    )
    src = re.sub(
        r'<PageShell>\s*'
        r'<div class="flex items-center gap-3 mb-5">\s*'
        r'<a href="/settings" class="btn btn-ghost btn-icon btn-sm"><ArrowLeft size="?\d+"?[^/]*/?>?</a>\s*'
        r'<p class="font-semibold text-sm">[^<]*</p>\s*'
        r'</div>',
        new_header,
        src,
        count=1,
    )

    # If <PageShell> still appears (e.g. closing tag later), drop it.
    src = src.replace('<PageShell>', '')
    src = re.sub(r'</PageShell>\s*', '', src)

    # 3) Lift the form card.
    src = src.replace('class="card p-5',  'class="surface-card p-4 md:p-5')
    src = src.replace('class="card p-4',  'class="surface-card p-4 md:p-5')
    src = src.replace('class="card p-3',  'class="surface-card p-3 md:p-4')
    src = src.replace('class="card-flat p-3', 'class="surface-card-flat p-3')

    # 4) Lift any leftover h3 in settings pages.
    src = re.sub(
        r'<h3 class="font-semibold text-sm">',
        '<h3 class="font-semibold text-[13.5px] text-[var(--text)] tracking-tight">',
        src,
    )

    # 5) Drop the now-stale ArrowLeft usage if any slipped through.
    src = re.sub(r'<ArrowLeft[^/]*/?>', '', src)

    path.write_text(src)
    print(f"lifted {path.relative_to(SETTINGS.parent.parent.parent)}")

for slug, (eyebrow, title) in TITLES.items():
    p = SETTINGS / slug / '+page.svelte'
    if p.exists():
        lift(p, eyebrow, title)
    else:
        print(f"SKIP: {p} not found")