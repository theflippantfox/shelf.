#!/usr/bin/env python3
"""Second pass: fix the case where the page had a blank line between
<svelte:head> and <PageShell>, breaking the first regex."""
import re
from pathlib import Path

SETTINGS = Path('/home/theflippantfox/Projects/shelf/src/routes/(app)/settings')

# Map page -> display title
TITLES = {
    'shop':       'Shop details',
    'locale':     'Locale & currency',
    'taxes':      'Taxes',
    'receipt':    'Receipt',
    'categories': 'Categories',
    'team':       'Team',
}

# Common pattern that survived: the back-button row + plain p title
RE_OLD_HEADER = re.compile(
    r'<div class="flex items-center gap-3 mb-5">\s*'
    r'<a href="/settings" class="btn btn-ghost btn-icon btn-sm">(?:<ArrowLeft[^>]*/?>)?(?:</a>)?\s*'
    r'<p class="font-semibold text-sm">([^<]+)</p>\s*'
    r'</div>',
    re.DOTALL,
)

NEW_HEADER = (
    '<header class="flex items-end justify-between gap-3 mb-5">\n'
    '  <div class="min-w-0">\n'
    '    <p class="eyebrow">Settings</p>\n'
    '    <h1 class="text-[22px] md:text-[26px] font-semibold text-[var(--text)] tracking-tight mt-0.5">{title}</h1>\n'
    '  </div>\n'
    '</header>'
)

for slug, title in TITLES.items():
    p = SETTINGS / slug / '+page.svelte'
    if not p.exists():
        continue
    src = p.read_text()
    new = RE_OLD_HEADER.sub(NEW_HEADER.format(title=title), src)
    if new != src:
        p.write_text(new)
        print(f"fixed {slug}")
    else:
        print(f"no change for {slug}")