#!/usr/bin/env python3
"""Drop every <p class="eyebrow">…</p> from (app) page bodies.

The Header.svelte top bar now shows a breadcrumb for section context,
so the page itself doesn't need to repeat the section name above the
title. The page header becomes just an h1 (with optional subtitle).

We also drop the leading mt-0.5 from the immediately-following h1
(since there's nothing above it to separate from)."""
import re
from pathlib import Path

ROUTES = Path('/home/theflippantfox/Projects/shelf/src/routes/(app)')

for f in ROUTES.rglob('+page.svelte'):
    src = f.read_text()
    if 'class="eyebrow"' not in src:
        continue

    # Pattern 1: eyebrow on its own line, then h1
    #   <p class="eyebrow">…</p>
    #   <h1 class="… tracking-tight mt-0.5">…</h1>
    new = re.sub(
        r'^\s*<p class="eyebrow">[^<]+</p>\s*\n\s*'
        r'(<h1 class="[^"]*?)( mt-0\.5)("[^>]*>[^<]*</h1>)',
        r'\1\3',
        src,
        flags=re.M,
    )
    if new != src:
        f.write_text(new)
        print(f"cleaned {f.relative_to(ROUTES.parent)}")
        continue

    # Pattern 2: eyebrow inside a min-w-0 wrapper, then h1
    new = re.sub(
        r'<p class="eyebrow">[^<]+</p>\s*\n\s*'
        r'(<h1 class="[^"]*?)( mt-0\.5)("[^>]*>)',
        r'\1\3',
        src,
    )
    if new != src:
        f.write_text(new)
        print(f"cleaned {f.relative_to(ROUTES.parent)}")