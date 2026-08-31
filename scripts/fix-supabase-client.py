#!/usr/bin/env python3
"""Fix all API route files: import userClientFromCtx, change call site."""
import re
import sys
from pathlib import Path

base = Path("src/routes/api")
files = list(base.rglob("+server.ts"))

for f in files:
    text = f.read_text()

    # Skip if doesn't import userClient
    if "userClient" not in text:
        continue

    # Skip if already fixed
    if "userClientFromCtx" in text:
        continue

    # Add cookies to destructure if not present
    # Find each `export async function X({...}: ...RequestEvent) {` and add cookies
    def add_cookies(m):
        head = m.group(1)
        body = m.group(2)
        if "cookies" in body.split(":")[0]:
            return m.group(0)  # already has cookies
        return f"export async function {head}({{ cookies, {body} }}: ..."

    text = re.sub(
        r"export async function (\w+)\(\{([^}]+)\}: import\('@sveltejs/kit'\)\.RequestEvent\) \{",
        lambda m: f"export async function {m.group(1)}({{ cookies, {m.group(2)} }}: import('@sveltejs/kit').RequestEvent) {{",
        text,
    )

    # Also handle `export const X = async` pattern (used in analytics)
    text = re.sub(
        r"export const (\w+) = async \(\{([^}]+)\}: import\('@sveltejs/kit'\)\.RequestEvent\) => \{",
        lambda m: f"export const {m.group(1)} = async ({{ cookies, {m.group(2)} }}: import('@sveltejs/kit').RequestEvent) => {{",
        text,
    )

    # Update import: add userClientFromCtx
    if "import { userClient } from '$lib/server/supabase';" in text:
        text = text.replace(
            "import { userClient } from '$lib/server/supabase';",
            "import { userClient, userClientFromCtx } from '$lib/server/supabase';",
        )

    # Update call sites
    text = text.replace(
        "const supabase = userClient({ cookies, locals } as any);",
        "const supabase = userClientFromCtx({ cookies } as any);",
    )
    # Also handle the older pattern
    text = text.replace(
        "const supabase = userClient({ locals } as any);",
        "const supabase = userClientFromCtx(event as any);",
    )

    f.write_text(text)
    print(f"  fixed: {f}")

print(f"\nProcessed {len(files)} files")