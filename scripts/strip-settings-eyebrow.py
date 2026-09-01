#!/usr/bin/env python3
"""Drop the redundant eyebrow from settings sub-pages.

The layout Header now shows a breadcrumb (e.g. "Settings / Shop details"),
so the page no longer needs its own eyebrow to put the section name above
the title. The page header becomes just a display title + optional subtitle."""
import re
from pathlib import Path

SETTINGS = Path('/home/theflippantfox/Projects/shelf/src/routes/(app)/settings')

for f in SETTINGS.glob('*/+page.svelte'):
    if f.name == '+page.svelte' and f.parent.name == 'settings':
        # Skip the index (which should keep its eyebrow as the page title)
        continue
    src = f.read_text()
    new = re.sub(
        r'<header class="flex items-end justify-between gap-3 mb-5">\s*'
        r'<div class="min-w-0">\s*'
        r'<p class="eyebrow">[^<]+</p>\s*'
        r'(<h1[^>]*>)([^<]+)(</h1>)\s*'
        r'(?:(<p class="text-\[11\.5px\] text-\[var\(--text-3\)\] mt-0\.5">.*?</p>)\s*)?'
        r'</div>',
        lambda m: (
            '<header class="flex items-end justify-between gap-3 mb-5">\n'
            '  <div class="min-w-0">\n'
            f'    {m.group(1)}{m.group(2)}{m.group(3)}\n'
            + (f'    {m.group(4)}\n' if m.group(4) else '')
            + '  </div>'
        ),
        src,
        count=1,
        flags=re.DOTALL,
    )
    if new != src:
        f.write_text(new)
        print(f"cleaned {f.parent.name}")