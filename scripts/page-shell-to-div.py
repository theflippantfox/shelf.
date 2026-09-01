#!/usr/bin/env python3
"""Replace <PageShell>...</PageShell> with a plain <div class="fade-up">.

The layout now provides page-shell padding, so PageShell just adds
fade-up animation. Strip the import too."""
import re
from pathlib import Path

ROUTES = Path('/home/theflippantfox/Projects/shelf/src/routes/(app)')

for f in ROUTES.rglob('+page.svelte'):
    src = f.read_text()
    if '<PageShell>' not in src:
        continue
    # Drop the import
    new = re.sub(r'^\s*import PageShell from .*?;\n', '', src, flags=re.M)
    # Replace <PageShell>\n  with <div class="fade-up">\n
    new = new.replace('<PageShell>', '<div class="fade-up">')
    # Replace </PageShell> with </div>
    new = new.replace('</PageShell>', '</div>')
    f.write_text(new)
    print(f"converted {f.relative_to(ROUTES.parent)}")