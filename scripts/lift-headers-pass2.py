#!/usr/bin/env python3
"""Pass 2 for the stragglers with different header structures."""
import re
from pathlib import Path

ROUTES = Path('/home/theflippantfox/Projects/shelf/src/routes/(app)')

# (path, eyebrow, title)
TARGETS = [
    ('customers/[id]/+page.svelte',           'Directory', 'Customer'),
    ('history/+page.svelte',                  'Activity',  'Sales history'),
    ('history/[id]/+page.svelte',             'Activity',  'Sale detail'),
    ('restocking/orders/new/+page.svelte',    'Restocking', 'New purchase order'),
    ('restocking/orders/[id]/+page.svelte',   'Restocking', 'Purchase order'),
]

# Handle history/+page.svelte (sub-eyebrow with computation)
# Handle the rest with various permutations of the page-header structure

for rel, eyebrow, title in TARGETS:
    p = ROUTES / rel
    if not p.exists():
        print(f"missing {rel}")
        continue
    src = p.read_text()

    # Drop the PageShell wrapper if present
    src = re.sub(r'^\s*import PageShell from .*?;\n', '', src, flags=re.M)
    src = re.sub(r'<PageShell>\s*', '', src)
    src = re.sub(r'</PageShell>\s*', '', src)

    # For history/+page.svelte: page-header with flex-1 min-w-0 and computed subtitle
    src = re.sub(
        r'<div class="page-header">\s*'
        r'<div class="flex-1 min-w-0">\s*'
        r'<p class="text-base font-semibold">([^<]+)</p>\s*'
        r'(<p class="text-xs text-\[var\(--text-3\)\]">.*?</p>)\s*'
        r'</div>\s*'
        r'(.*?)'
        r'</div>',
        lambda m: (
            '<header class="flex items-end justify-between gap-3 mb-5">\n'
            f'  <div class="min-w-0">\n'
            f'    <p class="eyebrow">{eyebrow}</p>\n'
            f'    <h1 class="text-[22px] md:text-[26px] font-semibold text-[var(--text)] tracking-tight mt-0.5">{m.group(1)}</h1>\n'
            f'    {m.group(2)}\n'
            f'  </div>\n'
            f'  {m.group(3).strip()}\n'
            f'</header>'
        ),
        src,
        count=1,
        flags=re.DOTALL,
    )

    # For restocking/orders/new/+page.svelte: page-header mb-6 with a back-button
    if rel == 'restocking/orders/new/+page.svelte':
        # Drop the back-button link (now that header is the nav)
        src = re.sub(
            r'<div class="page-header mb-6">\s*'
            r'<div class="flex items-center gap-3 flex-1">\s*'
            r'<a href="[^"]+" class="btn btn-ghost btn-icon btn-sm">\s*<ArrowLeft[^/]*/?>\s*</a>\s*'
            r'<div>\s*'
            r'<p class="text-base font-semibold">([^<]+)</p>\s*'
            r'(<p class="text-xs text-\[var\(--text-3\)\]">.*?</p>)\s*'
            r'</div>\s*'
            r'</div>\s*'
            r'(.*?)'
            r'</div>',
            lambda m: (
                '<header class="flex items-end justify-between gap-3 mb-5">\n'
                f'  <div class="min-w-0">\n'
                f'    <p class="eyebrow">{eyebrow}</p>\n'
                f'    <h1 class="text-[22px] md:text-[26px] font-semibold text-[var(--text)] tracking-tight mt-0.5">{m.group(1)}</h1>\n'
                f'    {m.group(2)}\n'
                f'  </div>\n'
                f'  {m.group(3).strip()}\n'
                f'</header>'
            ),
            src,
            count=1,
            flags=re.DOTALL,
        )

    # For the rest: page-header with title + subtitle, no PageShell
    src = re.sub(
        r'<div class="page-header[^"]*">\s*'
        r'<div[^>]*>\s*'
        r'<p class="text-base font-semibold">([^<]+)</p>\s*'
        r'(?:<p class="text-xs text-\[var\(--text-3\)\]">.*?</p>)?\s*'
        r'</div>\s*'
        r'(.*?)'
        r'</div>',
        lambda m: (
            '<header class="flex items-end justify-between gap-3 mb-5">\n'
            f'  <div class="min-w-0">\n'
            f'    <p class="eyebrow">{eyebrow}</p>\n'
            f'    <h1 class="text-[22px] md:text-[26px] font-semibold text-[var(--text)] tracking-tight mt-0.5">{m.group(1)}</h1>\n'
            f'  </div>\n'
            f'  {m.group(2).strip()}\n'
            f'</header>'
        ),
        src,
        count=1,
        flags=re.DOTALL,
    )

    p.write_text(src)
    print(f"lifted: {rel}")