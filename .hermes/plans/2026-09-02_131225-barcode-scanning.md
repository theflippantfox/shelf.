# Barcode Scanning Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to execute this plan task-by-task.

**Goal:** Add mobile back-camera barcode scanning to the PoS sale page. Products get an optional `barcode` field in the inventory form; the sale page has a camera button that opens a scanner, looks up the code, and adds the product to the cart with one tap.

**Architecture:**
- A new `BarcodeScanner.svelte` component wraps `@zxing/browser` (WebRTC + zxing-wasm) to read EAN-13, EAN-8, UPC-A, UPC-E, Code-128, and QR from the rear camera.
- The scanner is opened via a Sheet modal (consistent with the rest of the app's modal pattern).
- A new `/api/products/by-barcode/[code]/+server.ts` endpoint returns the matching product or 404, so the scanner can be reused anywhere.
- The sale page adds a "Scan" button next to the search bar (mobile only — desktop is irrelevant for back-camera).
- A Supabase migration adds an index on `products.barcode` for sub-millisecond lookups and makes the column unique per shop.

**Tech Stack:**
- `@zxing/browser` + `@zxing/library` — battle-tested scanner, supports all common retail formats
- Supabase RLS — barcode lookups go through `userClient` (RLS-correct)
- Existing SvelteKit patterns: Sheet for the modal, `$state` for UI state, `cart.addItem` for cart updates

---

## Current state (assumed verified)

- `products.barcode` column already exists (`text`, nullable, no index, no unique constraint)
- `src/routes/api/products/+server.ts` already accepts `barcode` on POST and selects it on GET
- `src/lib/components/ui/Sheet.svelte` is the canonical modal component
- `src/lib/stores/cart.svelte.ts` has an `addItem(productId, qty?)` method
- `src/routes/(app)/sale/+page.svelte` has a `<SearchBar>` on line 203 and a `cart` store imported
- `src/routes/(app)/inventory/+page.svelte` form has 9 fields, no `barcode` field; POST/PUT don't currently send it on edits (only on create)

---

## Task 1: Add barcode index and unique constraint

**Objective:** Add a Supabase migration that indexes `products.barcode` and makes it unique per shop (two different shops can both have product with barcode `8901234567890`, but a single shop can only have one).

**Files:**
- Create: `supabase/migrations/0009_products_barcode_unique.sql`
- Run locally: `npx supabase db reset` (or apply the migration only)

**Step 1: Write the migration**

```sql
-- 0009_products_barcode_unique.sql
--
-- Barcode scanning on the PoS page needs sub-millisecond lookups.
-- The barcode column is currently an unindexed text column.  Add a
-- composite unique index on (shop_id, barcode) so:
--   1. Lookups are fast (btree on a text column under typical N)
--   2. Two products in the same shop can't accidentally share a barcode
--
-- NULLs are excluded from unique constraints in Postgres, so products
-- without a barcode (most of them, today) are unaffected.

create unique index products_shop_id_barcode_unique_idx
  on public.products (shop_id, barcode)
  where barcode is not null;
```

**Step 2: Apply locally and verify**

Run: `npx supabase db reset`
Expected: migrations apply cleanly. Run a quick check:
`psql ... -c "select indexname from pg_indexes where tablename='products' and indexname like '%barcode%'"`
Expected: `products_shop_id_barcode_unique_idx`

**Step 3: Commit the migration file (don't apply to cloud yet — user does that)**

```bash
git add supabase/migrations/0009_products_barcode_unique.sql
git commit -m "feat(db): unique index on products.barcode per shop"
```

**Cloud application:** Write a `CLOUD_0009_products_barcode_unique.sql` companion with the same body but a `do $$ begin ... exception when duplicate_table then raise notice 'index already exists, skipping'; end $$;` wrapper so it's idempotent when run against the live cloud DB. The user can run this in the Supabase SQL editor.

---

## Task 2: `/api/products/by-barcode/[code]/+server.ts` lookup endpoint

**Objective:** GET a product by its barcode (within the current shop's RLS). Returns `{ id, name, sku, price, qty, unit, image_url, barcode }` on hit, 404 on miss.

**Files:**
- Create: `src/routes/api/products/by-barcode/[code]/+server.ts`
- Test: `scripts/test-barcode-lookup.sh`

**Step 1: Write the endpoint**

```ts
import { json } from '@sveltejs/kit';
import { userClientFromCtx } from '$lib/server/supabase';

/**
 * GET /api/products/by-barcode/[code]
 *
 * Lookup a product by its barcode, scoped to the current shop via RLS.
 * Used by the PoS barcode scanner — the camera reads the code, the
 * scanner calls this endpoint, and the result is added to the cart.
 *
 * Returns 404 (not 403) for "barcode doesn't exist" so the client can
 * show "no product found for this code" without leaking whether the
 * code exists in another shop.
 */
export async function GET({ cookies, params, locals }: import('@sveltejs/kit').RequestEvent) {
  if (!locals.currentShop) return json({ error: 'No shop' }, { status: 401 });
  const code = decodeURIComponent(params.code ?? '').trim();
  if (!code) return json({ error: 'Empty barcode' }, { status: 400 });

  const supabase = userClientFromCtx({ cookies } as any);
  const { data, error } = await supabase
    .from('products')
    .select('id, name, sku, price, qty, unit, image_url, barcode, low_stock_threshold')
    .eq('shop_id', locals.currentShop.id)
    .eq('barcode', code)
    .is('archived_at', null)
    .maybeSingle();

  if (error) return json({ error: error.message }, { status: 500 });
  if (!data) return json({ error: 'Not found' }, { status: 404 });
  return json(data);
}
```

**Step 2: Write a test script** (no test framework installed — keep with the existing `scripts/test-*.sh` pattern)

```bash
#!/usr/bin/env bash
# Smoke test: barcode lookup endpoint
set -e
cd "$(dirname "$0")/.."

# Reuse the auth cookie from the appearance test
EMAIL="barcode$(date +%s)@test.local"
PASSWORD="password123"

# Register + onboard
curl -sS -c /tmp/c.jar -X POST http://localhost:5173/api/auth/register \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"first_name\":\"B\",\"last_name\":\"C\"}" > /dev/null
curl -sS -b /tmp/c.jar -X POST http://localhost:5173/api/auth \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" -c /tmp/c.jar > /dev/null
# ... complete onboarding steps (same as scripts/test-onboarding.sh) ...
SHOP_ID="..." # capture from onboarding/shop response

# Create a product with a barcode
BARCODE="8901234567890"
curl -sS -b /tmp/c.jar -X POST http://localhost:5173/api/products \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"Test Barcode Item\",\"sku\":\"TBI-001\",\"price\":25,\"cost_price\":10,\"barcode\":\"$BARCODE\"}" > /dev/null

# Lookup hit
echo "=== Lookup hit ==="
curl -sS -b /tmp/c.jar -o /tmp/lookup.json -w "HTTP %{http_code}\n" \
  "http://localhost:5173/api/products/by-barcode/$BARCODE"
cat /tmp/lookup.json
echo

# Lookup miss
echo "=== Lookup miss ==="
curl -sS -b /tmp/c.jar -o /tmp/lookup.json -w "HTTP %{http_code}\n" \
  "http://localhost:5173/api/products/by-barcode/0000000000000"
cat /tmp/lookup.json
echo

# Cleanup test data
```

Expected: hit returns 200 + the product JSON, miss returns 404.

**Step 3: Commit**

```bash
git add src/routes/api/products/by-barcode/ scripts/test-barcode-lookup.sh
git commit -m "feat(api): barcode lookup endpoint for PoS scanner"
```

---

## Task 3: Add `barcode` field to the inventory form

**Objective:** Add a "Barcode" input to the Add/Edit product sheet. Optional. Accepts any text; the scanner will handle validation.

**Files:**
- Modify: `src/routes/(app)/inventory/+page.svelte`
  - `form` $state (line ~42): add `barcode: ''`
  - `resetForm()` (line ~136): add `barcode: ''`
  - `openEdit(p)` (line ~142): add `barcode: p.barcode ?? ''`
  - Form JSX (around line 439): add an Input next to SKU
  - `saveProduct()` POST body: include `barcode: form.barcode || null`
  - PUT/Edit path (look for the PATCH handler — likely `/api/products/[id]`): include `barcode`

**Step 1: Find the edit endpoint**

The inventory page does a POST to `/api/products` to create and a PATCH to `/api/products/[id]` to update. Check `src/routes/api/products/[id]/+server.ts` — if `barcode` isn't in the allowed-fields whitelist there, add it. (Almost certainly needs to be added; the POST was updated in commit `155a2c1` but the [id] handler may not have been.)

**Step 2: Patch the inventory form**

Add `barcode: ''` to the form state, reset, and openEdit. Add a barcode input next to SKU in the JSX. Send `barcode` in both POST and PATCH bodies.

**Step 3: Test the flow**

1. Open inventory, add a product, fill barcode `8901234567890`, save.
2. Verify via API: `curl -b /tmp/c.jar http://localhost:5173/api/products?search=8901234567890` returns the product.
3. Edit the product, change the barcode, save. Verify the change persisted.

**Step 4: Commit**

```bash
git add src/routes/(app)/inventory/+page.svelte src/routes/api/products/[id]/+server.ts
git commit -m "feat(inventory): barcode field on add/edit product form"
```

---

## Task 4: `BarcodeScanner.svelte` component

**Objective:** Build the camera scanner. Takes `open` (bindable) and `onResult(code: string)`. Renders a video preview, an overlay with a scan window, and a torch/close button. When a code is read, calls onResult and closes.

**Files:**
- Create: `src/lib/components/ui/BarcodeScanner.svelte`
- Install: `@zxing/browser` and `@zxing/library` via `pnpm add`

**Step 1: Install dependencies**

```bash
cd ~/Projects/shelf && pnpm add @zxing/browser @zxing/library
```

These have zero deps of their own and ~80KB gzipped combined. The browser build uses `getUserMedia` and decodes frames via WebAssembly.

**Step 2: Write the component**

Key design points:
- Use `BrowserMultiFormatReader.decodeFromVideoDevice(undefined, videoEl, callback)` — it picks the rear camera automatically (`facingMode: 'environment'` is the default).
- Decode formats: `EAN_13 | EAN_8 | UPC_A | UPC_E | CODE_128 | QR_CODE` — the formats a retail shop would actually see.
- Stop the reader on close, on unmount, and on route change. Leaking the camera is a real battery + privacy issue.
- Show a "no camera permission" message if `getUserMedia` rejects.
- iOS Safari requires the user gesture to trigger `getUserMedia` — opening the modal IS the user gesture, so this works.
- HTTPS is required for `getUserMedia` on real devices, but `localhost` is exempted — this is fine for dev, production deploy is already on Vercel with HTTPS.

Skeleton (the implementer will flesh it out):

```svelte
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { BrowserMultiFormatReader, IScannerControls } from '@zxing/browser';
  import { X, Zap, ZapOff, CameraOff } from 'lucide-svelte';
  import Sheet from './Sheet.svelte';

  type Props = {
    open: boolean;
    onResult: (code: string) => void;
    onClose: () => void;
  };
  let { open, onResult, onClose }: Props = $props();

  let videoEl: HTMLVideoElement;
  let controls: IScannerControls | null = null;
  let torchOn = $state(false);
  let error  = $state<string | null>(null);
  let lastCode = '';

  const reader = new BrowserMultiFormatReader(
    { formats: [/* EAN_13, EAN_8, UPC_A, UPC_E, CODE_128, QR_CODE */] }
  );

  async function start() {
    try {
      controls = await reader.decodeFromVideoDevice(
        undefined, videoEl,
        (result, err) => {
          if (result) {
            const code = result.getText();
            if (code === lastCode) return;  // debounce duplicate frames
            lastCode = code;
            onResult(code);
            stop();
            onClose();
          }
        }
      );
    } catch (e: any) {
      error = e?.message ?? 'Could not start camera';
    }
  }

  function stop() {
    controls?.stop();
    controls = null;
  }

  $effect(() => {
    if (open) start();
    else      stop();
  });

  onDestroy(stop);

  async function toggleTorch() {
    // torch requires `track.applyConstraints({ advanced: [{ torch: true }] })`
    // wrapped in a getUserMedia constraints call
    // ... (implementer fleshes this out)
  }
</script>

<Sheet bind:open title="Scan barcode" maxWidth="max-w-md">
  <div class="relative aspect-[4/3] bg-[var(--inset)] rounded-[var(--radius-md)] overflow-hidden">
    <video bind:this={videoEl} class="w-full h-full object-cover" muted playsinline></video>

    <!-- scan window overlay: 80% wide, centered, 30% tall -->
    <div class="absolute inset-0 flex items-center justify-center pointer-events-none">
      <div class="w-[80%] h-[30%] border-2 border-[var(--primary)] rounded-md shadow-[0_0_0_9999px_rgba(0,0,0,0.4)]"></div>
    </div>

    {#if error}
      <div class="absolute inset-0 flex flex-col items-center justify-center gap-2 text-[var(--text-2)]">
        <CameraOff size={32} />
        <p class="text-sm font-semibold">{error}</p>
        <p class="text-xs text-[var(--text-3)] text-center px-4">Allow camera access in your browser settings, or type the barcode manually.</p>
      </div>
    {/if}
  </div>

  <div class="mt-3 flex gap-2">
    <button class="btn btn-secondary flex-1" onclick={toggleTorch}>
      {#if torchOn}<ZapOff size={14} /> Torch off{:else}<Zap size={14} /> Torch on{/if}
    </button>
    <button class="btn btn-secondary" onclick={() => { stop(); onClose(); }} aria-label="Close scanner">
      <X size={14} /> Cancel
    </button>
  </div>
</Sheet>
```

**Step 3: Visual verification**

Manually test in a desktop browser with a webcam, and on a real phone. The scan window should turn green (or pulse) on a successful read. Repeated reads of the same code should not re-fire onResult.

**Step 4: Commit**

```bash
git add src/lib/components/ui/BarcodeScanner.svelte pnpm-lock.yaml package.json
git commit -m "feat(scan): BarcodeScanner component using @zxing/browser"
```

---

## Task 5: Wire the scanner into the sale page

**Objective:** Add a "Scan" button next to the search bar on `/sale`. On mobile only. On click, opens the scanner. On result, calls the lookup endpoint, adds the product to the cart, shows a toast. On 404, shows "No product found for this code" with a "Add to inventory" link.

**Files:**
- Modify: `src/routes/(app)/sale/+page.svelte`
  - Imports: add `BarcodeScanner`, `Scan` (lucide), `toasts`
  - State: `let scanOpen = $state(false)`
  - JSX near the search bar: add a scan button
  - `onScanResult(code)` handler: fetch the lookup endpoint, handle 200/404/error
- Modify: `src/lib/components/ui/SearchBar.svelte` — the right slot is `pr-9` for the X button; consider whether to expose a `right` snippet slot, OR just position the scan button absolutely next to the SearchBar (decision: absolute, simpler)

**Step 1: The handler**

```ts
async function onScanResult(code: string) {
  scanOpen = false;
  try {
    const res = await fetch(`/api/products/by-barcode/${encodeURIComponent(code)}`);
    if (res.ok) {
      const p = await res.json();
      cart.addItem(p.id, 1);
      toasts.success(`Added ${p.name}`);
    } else if (res.status === 404) {
      toasts.error(`No product found for ${code}`);
    } else {
      toasts.error('Lookup failed');
    }
  } catch {
    toasts.error('Network error');
  }
}
```

**Step 2: The button**

Place it on the right side of the search bar, mobile-only (`md:hidden`). Use a 28px square button with the `Scan` icon.

```svelte
<div class="relative">
  <SearchBar bind:value={search} placeholder="Search by name, SKU or barcode…" />
  <button
    type="button"
    class="md:hidden absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-md bg-[var(--primary)] text-[var(--primary-fg)] flex items-center justify-center"
    onclick={() => (scanOpen = true)}
    aria-label="Scan barcode"
  >
    <Scan size={14} strokeWidth={2} />
  </button>
</div>

<BarcodeScanner
  open={scanOpen}
  onClose={() => (scanOpen = false)}
  onResult={onScanResult}
/>
```

**Step 3: Test**

1. Sign in on a phone (or use Chrome DevTools mobile emulator with a virtual camera).
2. Open /sale.
3. Tap the scan button. The camera should open with a scan window overlay.
4. Show a barcode to the camera. The product should land in the cart.

**Step 4: Commit**

```bash
git add src/routes/(app)/sale/+page.svelte
git commit -m "feat(pos): scan button on mobile opens barcode scanner"
```

---

## Task 6: Polish — debounce, last-scanned feedback, error toasts

**Objective:** The scanner's default zxing behavior fires `onResult` on every frame that decodes, which is up to 30 times a second. We already debounce by `lastCode` in Task 4, but the UX can be smoother:
- After a successful read, briefly highlight the scan window green and show "Added!" for 600ms before closing.
- If the user denies camera permission, show a manual barcode input fallback so they can still scan-and-add without a camera.
- If the lookup returns 404, offer "Add as new product" → links to /inventory with a pre-filled barcode.

**Files:**
- Modify: `src/lib/components/ui/BarcodeScanner.svelte` (add success pulse + manual input)
- Modify: `src/routes/(app)/sale/+page.svelte` (404 → "Add" link)

**Step 1: Success pulse**

In `BarcodeScanner.svelte`, after calling onResult, set `scanned = true` for 600ms, then close. The scan-window border animates to `var(--teal)` during the pulse.

**Step 2: Manual input fallback**

In the error branch (no camera), render a text input + "Add" button. Calls onResult with the typed code, then closes. This makes the scanner usable on a desktop without a camera (for testing) and on phones where the user denied permission.

**Step 3: 404 → inventory**

In `onScanResult`, when res.status === 404, the toast should include an action:
```ts
toasts.error(`No product for ${code}`, {
  action: { label: 'Add new', href: `/inventory?barcode=${code}` },
});
```
(This requires the `toasts` store to support actions — check `src/lib/stores/toast.svelte.ts`. If it doesn't, skip the action and just toast the message; the user can navigate manually.)

**Step 4: Verify**

1. Successful read on a known barcode → product added, brief green pulse.
2. Read a code that doesn't exist → "No product for X" toast.
3. Deny camera permission → manual input appears.
4. Click "Add new" on a 404 → navigates to /inventory.

**Step 5: Commit**

```bash
git add src/lib/components/ui/BarcodeScanner.svelte src/routes/(app)/sale/+page.svelte
git commit -m "feat(scan): success pulse, manual fallback, add-as-new on 404"
```

---

## Task 7: Final review and cloud migration

**Objective:** Apply the migration to the cloud DB and verify the whole flow end-to-end.

**Files:**
- Create: `CLOUD_0009_products_barcode_unique.sql` (idempotent version of Task 1's migration)

**Step 1: Write the cloud migration**

```sql
-- CLOUD_0009_products_barcode_unique.sql
--
-- Idempotent version of 0009 for the cloud DB.  Wraps the index
-- creation in a do-block that skips if the index already exists.

do $$
begin
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename  = 'products'
      and indexname  = 'products_shop_id_barcode_unique_idx'
  ) then
    create unique index products_shop_id_barcode_unique_idx
      on public.products (shop_id, barcode)
      where barcode is not null;
  end if;
end $$;
```

**Step 2: Final svelte-check + visual review**

```bash
npx svelte-check
```
Expected: 18 errors / 20 warnings (baseline, no new errors).

Manual end-to-end test on mobile:
- Add a product with a barcode in /inventory.
- Open /sale on the phone, tap the scan button.
- Scan the product's barcode → it lands in the cart.
- Scan a non-existent code → "No product for X" toast.
- Save the sale → inventory decrements correctly.

**Step 3: Commit the cloud migration companion**

```bash
git add CLOUD_0009_products_barcode_unique.sql
git commit -m "feat(db): cloud migration for products.barcode unique index"
```

The user runs the cloud migration in the Supabase SQL editor.

---

## Files likely to change (summary)

- New: `supabase/migrations/0009_products_barcode_unique.sql`
- New: `CLOUD_0009_products_barcode_unique.sql`
- New: `src/routes/api/products/by-barcode/[code]/+server.ts`
- New: `src/lib/components/ui/BarcodeScanner.svelte`
- New: `scripts/test-barcode-lookup.sh`
- Modified: `src/routes/(app)/inventory/+page.svelte` (form + send barcode)
- Modified: `src/routes/api/products/[id]/+server.ts` (whitelist barcode on PATCH)
- Modified: `src/routes/(app)/sale/+page.svelte` (scan button + handler)
- Modified: `package.json` + `pnpm-lock.yaml` (new deps)

## Tests / validation

- `scripts/test-barcode-lookup.sh` covers 200 hit + 404 miss for the lookup endpoint.
- Manual mobile test: scan a real EAN-13 barcode, verify it adds to the cart.
- Manual desktop test: deny camera, verify the manual-input fallback works.
- svelte-check: stays at 18/20 baseline.
- The `/sale` route returns 200; no console errors.

## Risks, tradeoffs, and open questions

1. **@zxing size.** ~80KB gzipped. Acceptable for a retail POS where the scanner is the primary input method. If size becomes a concern later, `@zxing/browser` can lazy-load only on the sale page.

2. **Camera permission UX.** The first time a user opens the scanner, iOS will prompt for camera access. If they deny, the scanner shows the manual-input fallback (Task 6). The permission state persists per-origin in the browser — we can't reset it from the app.

3. **HTTPS requirement.** `getUserMedia` requires HTTPS in production. The app already deploys via Vercel with HTTPS, so this is fine. Local dev is on `localhost` which is exempted.

4. **Multiple cameras.** On phones with multiple rear cameras (some Android devices), zxing's `decodeFromVideoDevice(undefined, ...)` picks the first rear camera, which is usually correct. If a user reports the wrong camera, we can add a camera-picker UI later. Not in scope.

5. **Inventory page barcode search.** Once products have barcodes, the inventory page's `<SearchBar>` (which currently searches name + description) could also match barcode. The API would need a small change. NOT in this plan — separate task. The scanner + cart flow is the priority.

6. **Print barcode labels.** A natural follow-up is printing barcode labels for products that don't have one. Out of scope for this plan.

7. **The `toasts` action support.** Task 6 step 3 depends on whether `src/lib/stores/toast.svelte.ts` already supports `action: { label, href }`. If it doesn't, the "Add as new" link is a follow-up. The implementer should check this and adapt.
