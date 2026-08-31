import re
from pathlib import Path

p = Path('src/routes/(app)/+page.server.ts')
text = p.read_text()

# Use string-based replace, not regex
import re
def wrap_null(match_text):
    # match_text is like "(todaySales as any[]).reduce"
    # extract the varname
    inner = match_text.split(' as any[]')[0].lstrip('(')
    return f'(({inner} as any[]) ?? []).' + match_text.split(').')[-1]

# Find all (X as any[]).method patterns
for method in ['reduce', 'length', 'map', 'filter', 'forEach', 'find']:
    pattern = re.compile(r'\(\w+ as any\[\]\)\.' + method)
    text = pattern.sub(lambda m: f'(({m.group(0)[1:m.group(0).index(" as any[]")]} as any[]) ?? []).{method}', text)

p.write_text(text)
print('done; replaced', text.count('?? []'), 'call sites')