#!/usr/bin/env python3
"""Remove the now-redundant <div class="page-shell"> wrapper from each
settings sub-page. The (app) layout now provides page-shell padding."""
import re
from pathlib import Path

SETTINGS = Path('/home/theflippantfox/Projects/shelf/src/routes/(app)/settings')

for f in SETTINGS.glob('*/+page.svelte'):
    src = f.read_text()
    if 'class="page-shell"' not in src:
        continue
    # Drop the opening <div class="page-shell">\n after </header> or svelte:head
    new = re.sub(
        r'(\n</header>\n|\n</svelte:head>\n)\s*<div class="page-shell">\n',
        r'\1',
        src,
    )
    # Drop the closing </div> at EOF
    new = re.sub(r'\n</div>\s*$', '\n', new)
    if new != src:
        f.write_text(new)
        print(f"cleaned {f.parent.name}")