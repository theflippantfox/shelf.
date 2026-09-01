#!/usr/bin/env python3
"""Final pass: lift the 10 remaining (app) routes' headers.

Replaces:
  <PageShell>
    <div class="page-header">
      <div class="flex-1">
        <p class="text-base font-semibold">Title</p>
        <p class="text-xs text-[var(--text-3)]">subtitle</p>
      </div>
      [...optional buttons...]
    </div>

with the new eyebrow + display-md header. Then removes the
</PageShell> closing tag and the import.
"""
import re
from pathlib import Path

ROUTES = Path('/home/theflippantfox/Projects/shelf/src/routes/(app)')

# Tries: (page-relative path) -> (eyebrow, display title)
EXPLICIT_TITLES = {
    'customers/+page.svelte':                  ('Directory', 'Customers'),
    'customers/[id]/+page.svelte':             ('Directory', 'Customer'),
    'history/+page.svelte':                    ('Activity',  'Sales history'),
    'history/[id]/+page.svelte':               ('Activity',  'Sale detail'),
    'restocking/+page.svelte':                 ('Inventory', 'Restocking'),
    'restocking/orders/new/+page.svelte':      ('Restocking', 'New purchase order'),
    'restocking/orders/[id]/+page.svelte':     ('Restocking', 'Purchase order'),
    'restocking/orders/[id]/receive/+page.svelte': ('Restocking', 'Receive order'),
    'restocking/suppliers/+page.svelte':       ('Restocking', 'Suppliers'),
    'restocking/price-comparison/+page.svelte':('Restocking', 'Price comparison'),
}

def lift(path: Path):
    rel = path.relative_to(ROUTES).as_posix()
    src = path.read_text()
    eyebrow, title = EXPLICIT_TITLES.get(rel, (None, None))
    if not title:
        return False

    # Drop the PageShell import + the <PageShell> open + </PageShell> close.
    src = re.sub(r'^\s*import PageShell from .*?;\n', '', src, flags=re.M)
    src = re.sub(r'<PageShell>\s*', '', src)
    src = re.sub(r'</PageShell>\s*', '', src)

    # Replace the page-header block. The pattern: <div class="page-header"> ... <p class="text-base font-semibold">TITLE</p> ... </div>
    # We capture the title text and any trailing subtitle + optional buttons after the close of the flex-1 div.

    # Approach: locate the page-header block, then split it into
    # title+subtitle (left side) and any buttons (right side).
    new = re.sub(
        r'<div class="page-header">\s*'
        r'<div class="flex-1">\s*'
        r'<p class="text-base font-semibold">([^<]+)</p>\s*'
        r'(?:<p class="text-xs text-\[var\(--text-3\)\]">([^<]*)</p>)?\s*'
        r'</div>\s*'
        r'(.*?)'
        r'</div>',
        lambda m: (
            '<header class="flex items-end justify-between gap-3 mb-5">\n'
            f'  <div class="min-w-0">\n'
            f'    <p class="eyebrow">{eyebrow}</p>\n'
            f'    <h1 class="text-[22px] md:text-[26px] font-semibold text-[var(--text)] tracking-tight mt-0.5">{m.group(1)}</h1>\n'
            + (f'    <p class="text-[11.5px] text-[var(--text-3)] mt-0.5">{m.group(2)}</p>\n' if m.group(2) else '')
            + f'  </div>\n'
            f'  {m.group(3).strip()}\n'
            f'</header>'
        ),
        src,
        count=1,
        flags=re.DOTALL,
    )

    if new == src:
        print(f"  no change: {rel}")
        return False
    path.write_text(new)
    print(f"  lifted: {rel}")
    return True

for rel in EXPLICIT_TITLES:
    p = ROUTES / rel
    if p.exists():
        lift(p)
    else:
        print(f"  missing: {rel}")