#!/usr/bin/env python3
"""Pass 3: wrap the settings sub-page body in a <div class="page-shell">
since we removed the PageShell wrapper."""
import re
from pathlib import Path

SETTINGS = Path('/home/theflippantfox/Projects/shelf/src/routes/(app)/settings')

for f in SETTINGS.glob('*/+page.svelte'):
    src = f.read_text()
    # If already wrapped, skip
    if 'class="page-shell' in src:
        continue
    # Wrap everything after the </header> in a page-shell div
    new = re.sub(
        r'(</header>\n)',
        r'\1\n<div class="page-shell">\n',
        src,
        count=1,
    )
    # Add closing div before </svelte:head> would be wrong; do it at EOF
    if new != src:
        new = new.rstrip() + '\n</div>\n'
        f.write_text(new)
        print(f"wrapped {f.parent.name}")