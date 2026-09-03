# Cloud DB One-Time Normalization (Paste-and-Run SQL)

When a project is migrated to a new backend (e.g. Directus → Supabase), the **local** Supabase stack can be reset and re-seeded, but the **cloud** Supabase project keeps whatever data the user already created in production. The first migration runs as a series of `supabase/migrations/000X_*.sql` files in the auto-apply chain. Any **later** cleanup that only affects the cloud — and that the user wants to inspect before applying — should NOT be added to that chain. It belongs in a separate `CLOUD_*.sql` file that the user pastes into the Supabase SQL editor and runs by hand, in three steps:

1. **DRY RUN** — a `SELECT` that shows every row the next statement would change, with the **old** and **new** values side-by-side.
2. **FIX** — an `UPDATE` (or several) wrapped in a `BEGIN`/`COMMIT` transaction so a `ROLLBACK` is one keyword away.
3. **VERIFY** — a `SELECT count(*)` that should return 0; anything else is a row the heuristic couldn't safely migrate and the user must fix by hand.

This is the right shape whenever the migration:

- Only affects legacy rows (every row in the current data is "fine", only old rows have the issue).
- Has a *fingerprint* predicate you can use to identify the legacy rows with high confidence (e.g. "value is exactly 100× its paired column").
- Has a *non-destructive* transformation (dividing by 100, swapping two columns, renaming an enum value).

The fingerprint predicate is the hard part. It must be tight enough that a real (non-legacy) row never matches it, otherwise you'll silently rewrite data the user wanted kept. Two common patterns:

## Pattern 1: Pair-cross-check (when the paired column has the truth)

Most useful when the legacy migration accidentally stored one column in minor units and a related column in major units. Example: `sales.discount_value` was migrated as 100× `discount_amount` (because the original Directus column was in paise, but `discount_amount` was recomputed in rupees). The fingerprint:

```sql
WHERE discount_value > 0
  AND discount_amount > 0
  AND discount_value / 100.0 = discount_amount::numeric
```

A `0/0` row won't match (the `> 0` guards). A row where `discount_value` is already in major units (1:1 with `discount_amount`) won't match. Only the legacy 100:1 footprint matches. Run a `SELECT COUNT(*)` first to see how many rows the migration will touch; if the count surprises you, **stop and inspect** before running the UPDATE.

## Pattern 2: Round-multiple + no live history (when no paired column exists)

Most useful when the column has no obvious pair, e.g. `products.price` was multiplied by 100 on save by the old inventory form, but there are no other columns to cross-check against. Heuristic: "looks like minor units AND has no live sales to contradict it". Specifically:

```sql
WHERE price > 100                 -- skip zero/tiny values that round-trip fine
  AND price % 100 = 0             -- only round multiples of 100
  AND cost_price > 100
  AND cost_price % 100 = 0
  AND NOT EXISTS (
    SELECT 1 FROM sale_items WHERE sale_items.product_id = products.id
  )
```

The `NOT EXISTS` clause is the strong signal: if the product has ever been sold, `sale_items.unit_price` is the ground truth, and that ground truth was written by the current app code (which doesn't `*100`). If the live sale price matches `product.price` (1:1), the product is in major units — leave it alone. If the product has no sales history at all, it might be in minor units; the round-multiple test catches most of those.

This pattern has a known false-positive: a real expensive product (e.g. ₹1500 gold jewelry) with no sales history. The DRY RUN surfaces these — they're the rows where you read the output and say "wait, that ₹1500 product is legitimately ₹1500, not ₹15 in paise". The VERIFY step's `count(*) > 0` is your final reminder to manually re-price those.

## Pattern 3: Enum value rename (different problem, same shape)

A legacy column has values that need to be renamed to the new vocabulary. The fingerprint is a `WHERE old_value IN (...)` list. The transformation is `set column = 'new_value' where column = 'old_value'`. Wrap in `BEGIN`/`COMMIT` so a `ROLLBACK` is one keyword away. The DRY RUN shows the before/after list. The VERIFY runs the same `WHERE` and should return 0.

## What NEVER goes in a `CLOUD_*.sql` file

- Destructive drops (`drop table`, `drop column`) — those need a real migration, not a paste-and-run.
- Schema changes that need to be in the auto-apply chain (new tables, RLS policies, function signatures) — those go in `supabase/migrations/000N_*.sql` so every environment gets them.
- Anything that requires app code to also change (e.g. dropping a column the app still references) — coordinate the app change first, then add the cloud cleanup as a separate step.

## File naming

`CLOUD_<topic>.sql` (uppercase prefix is the visual flag). Place in `supabase/migrations/` so it lives with the rest of the schema work, but the numeric prefix is intentionally omitted — that file is **not** in the auto-apply chain, it's documentation of a manual cleanup step.

## Worked example: minor-units → major-units (the "100x bug" cleanup)

This is the canonical example for Shëlf POS. The Directus → Supabase migration stored `products.price` in paise on the cloud (because the old inventory form did `* 100` on save), but the rest of the app uses major units. Three queries, in this order:

```sql
-- 1. DRY RUN. Inspect every "would-migrate" row before running the fix.
SELECT
  p.id, p.shop_id, p.name,
  p.price              AS old_price,
  p.price / 100.0      AS new_price,
  p.cost_price         AS old_cost_price,
  p.cost_price / 100.0 AS new_cost_price,
  (SELECT count(*) FROM sale_items si WHERE si.product_id = p.id) AS sales
FROM products p
WHERE p.price > 100
  AND p.price % 100 = 0
  AND p.cost_price > 100
  AND p.cost_price % 100 = 0
  AND NOT EXISTS (SELECT 1 FROM sale_items si WHERE si.product_id = p.id);
```

```sql
-- 2. FIX. Wrapped in a transaction. Adjust shop_id filter if needed.
BEGIN;

UPDATE products p
SET    price      = p.price      / 100.0,
       cost_price = p.cost_price / 100.0
WHERE  p.id IN (
  -- same predicate as the DRY RUN
  SELECT id FROM products
  WHERE  price > 100
    AND  price % 100 = 0
    AND  cost_price > 100
    AND  cost_price % 100 = 0
    AND  NOT EXISTS (SELECT 1 FROM sale_items si WHERE si.product_id = products.id)
);

-- Optional: same treatment for purchase_order_items with no receipts
UPDATE purchase_order_items poi
SET    unit_cost  = unit_cost  / 100.0,
       line_total = line_total / 100.0
WHERE  unit_cost > 100 AND unit_cost % 100 = 0
  AND  line_total % 100 = 0
  AND  quantity_received = 0;

COMMIT;
```

```sql
-- 3. VERIFY. Should return 0; otherwise inspect those rows by hand.
SELECT count(*)
FROM products p
WHERE p.price > 100
  AND p.price % 100 = 0
  AND p.cost_price > 100
  AND p.cost_price % 100 = 0
  AND NOT EXISTS (SELECT 1 FROM sale_items si WHERE si.product_id = p.id);
```

## Why this is the right shape for a one-time cloud cleanup

- **The user runs it in their Supabase SQL editor.** They see the DRY RUN output before any data is touched. They can copy the predicted changes into a spreadsheet and verify.
- **The transaction is one keyword away from rollback.** If the DRY RUN showed an unexpected count or a row that looks wrong, the user adds `ROLLBACK;` instead of `COMMIT;` and nothing happens.
- **The VERIFY step is a count, not a join.** A `count(*) > 0` is the unambiguous "go look at these manually" signal — no need to write a separate report.
- **It lives in the repo** as documentation of the canonical fix. The next time the project changes its money convention (it won't, but hypothetically), the same three-query shape applies.

The full file is in `supabase/migrations/CLOUD_normalize_money_to_major.sql` in the Shëlf POS project.
