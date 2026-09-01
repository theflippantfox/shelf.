#!/usr/bin/env python3
"""Drop ALL subtitle-style <p> paragraphs from (app) page bodies.

The user said "remove everything else from every page" — strict
interpretation: h1 only on every page, no subtitle text-3
paragraphs anywhere in the page body. We only touch the most
common subtitle pattern (text-[Xpx] text-3 mt-0.5/1) and leave
error messages, KPI sub-labels, and the like alone."""
import re
from pathlib import Path

ROUTES = Path('/home/theflippantfox/Projects/shelf/src/routes/(app)')

# Match a <p> with a font-size token, text-3, and mt-0.5 (subtitle pattern)
SUBTITLE_RE = re.compile(
    r'\n\s*<p class="text-\[(?:1[01](\.[0-9])?|12)(\.[0-9])?px\] text-\[var\(--text-3\)\] mt-0\.5">.*?</p>',
    re.DOTALL,
)

# Match the legacy <p class="text-xs text-3 mt-1"> form
SUBTITLE_RE_LEGACY = re.compile(
    r'\n\s*<p class="text-xs text-\[var\(--text-3\)\] mt-1">.*?</p>',
    re.DOTALL,
)

for f in ROUTES.rglob('+page.svelte'):
    src = f.read_text()
    new = SUBTITLE_RE.sub('', src)
    new = SUBTITLE_RE_LEGACY.sub('', new)
    if new != src:
        f.write_text(new)
        print(f"stripped {f.relative_to(ROUTES.parent)}")