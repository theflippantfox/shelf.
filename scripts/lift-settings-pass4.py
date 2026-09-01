#!/usr/bin/env python3
"""Pass 4: handle the two files where the regex didn't match because
the header had additional buttons (team) or different structure (categories).
Also wrap them in page-shell since PageShell is gone."""
import re
from pathlib import Path

SETTINGS = Path('/home/theflippantfox/Projects/shelf/src/routes/(app)/settings')

# --- team page: has the "Add member" button in the header row ---
team = SETTINGS / 'team' / '+page.svelte'
src = team.read_text()
src = re.sub(
    r'<div class="flex items-center gap-3 mb-5">\s*'
    r'<a href="/settings" class="btn btn-ghost btn-icon btn-sm">(?:<ArrowLeft[^>]*/?>)?(?:</a>)?\s*'
    r'<p class="font-semibold text-sm flex-1">Team</p>\s*'
    r'(<Button[^>]*>.*?</Button>)\s*'
    r'</div>',
    lambda m: (
        '<header class="flex items-end justify-between gap-3 mb-5">\n'
        '  <div class="min-w-0">\n'
        '    <p class="eyebrow">Settings</p>\n'
        '    <h1 class="text-[22px] md:text-[26px] font-semibold text-[var(--text)] tracking-tight mt-0.5">Team</h1>\n'
        '  </div>\n'
        f'  {m.group(1)}\n'
        '</header>'
    ),
    src,
    flags=re.DOTALL,
)
src = src.replace('class="card overflow-hidden"', 'class="surface-card overflow-hidden"')
# Wrap in page-shell if not already
if 'class="page-shell"' not in src:
    src = re.sub(r'(</header>\n)', r'\1\n<div class="page-shell">\n', src, count=1)
    src = src.rstrip() + '\n</div>\n'
team.write_text(src)
print("fixed team")

# --- categories page: just wrap + replace card ---
cat = SETTINGS / 'categories' / '+page.svelte'
src = cat.read_text()
src = src.replace('class="card overflow-hidden"', 'class="surface-card overflow-hidden"')
src = src.replace('class="card p-4', 'class="surface-card p-4 md:p-5')
if 'class="page-shell"' not in src:
    src = re.sub(r'(</header>\n|<svelte:head>[^<]*</svelte:head>\n)', r'\1\n<div class="page-shell">\n', src, count=1)
    src = src.rstrip() + '\n</div>\n'
cat.write_text(src)
print("fixed categories")