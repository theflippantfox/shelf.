#!/usr/bin/env python3
"""Fix +page.server.ts files: add cookies to destructure, switch to userClientFromCtx."""
import re
from pathlib import Path

base = Path("src/routes/(app)")
files = list(base.rglob("+page.server.ts"))

fixed = 0
for f in files:
    text = f.read_text()
    if "userClient({ locals } as any)" not in text:
        continue

    # 1. Add cookies to destructure of `load({ ... }: RequestEvent) {`
    def add_cookies(m):
        body = m.group(1)
        if "cookies" in body:
            return m.group(0)
        return f"load({{ cookies, {body} }}: RequestEvent) {{"

    text = re.sub(
        r"load\(\{([^}]+)\}: RequestEvent\) \{",
        add_cookies,
        text,
    )

    # 2. Replace call site
    text = text.replace(
        "userClient({ locals } as any)",
        "userClientFromCtx({ cookies } as any)",
    )

    # 3. Add userClientFromCtx to import if not present
    if "userClientFromCtx" in text:
        m = re.search(r"import \{ ([^}]+) \} from '\$lib/server/supabase';", text)
        if m and "userClientFromCtx" not in m.group(1):
            existing = m.group(1)
            new_import = existing + ", userClientFromCtx"
            text = re.sub(
                r"import \{ ([^}]+) \} from '\$lib/server/supabase';",
                f"import {{ {new_import} }} from '$lib/server/supabase';",
                text,
                count=1,
            )

    f.write_text(text)
    print(f"  fixed: {f}")
    fixed += 1

print(f"\nFixed {fixed} files")