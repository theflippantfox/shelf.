# Shëlf — Session Backlog

Completed work from the current development session.

## ✅ Completed

### Theme & Appearance

- [x] Rewrote all 10 palette definitions to visually distinct color-hue corners
- [x] Updated palette card UI in settings and onboarding pages

### Reactivity & Sync

- [x] Settings shop page — optimistic `currentShop.update()` after save
- [x] Settings locale page — optimistic update + `setFormatLocale()` after save
- [x] Settings taxes page — optimistic update after save
- [x] Settings receipt page — optimistic update after save
- [x] Sale → register store sync (online + offline)
- [x] Cache refresh → store hydration via layout polling
- [x] Fixed `effect_update_depth_exceeded` infinite loop between stores
- [x] Swapped dynamic imports to static in hot paths (navigation speed)

### Analytics Cache

- [x] IndexedDB `analytics_cache` object store (schema v5)
- [x] `readAnalyticsCache`, `writeAnalyticsCache`, `buildAnalyticsCacheKey` helpers
- [x] Cache-first page load via universal `+page.ts`
- [x] Background API fetch replaces cached data
- [x] `refreshAnalyticsCache()` for all 6 period presets
- [x] Server load made lightweight (no Supabase queries on SSR)
- [x] Period tabs now reactive via `$effect` watching `page.url.search`

### Realtime Sync

- [x] Browser Supabase client singleton (`supabase-browser.ts`)
- [x] Realtime subscription manager (`realtime.ts`) — full CRUD handlers
- [x] Layout Realtime wiring for WebSocket subscriptions

### Barcode Scanner

- [x] Upgraded to native `BarcodeDetector` API
- [x] Instant local O(1) inventory lookup before fallback remote call

### POS Payment Flow Redesign

- [x] Removed payment method selector buttons
- [x] Always-visible Cash/UPI/Credit inputs with smart redistribution
- [x] Discount + Round-off fields added to cart sheet
- [x] `finalTotal = grandTotal + roundOff` derived value
- [x] Hard cap: sum of splits never exceeds `finalTotal`
- [x] Checkout sheet simplified (compact, no payment method display)

### Split Payments

- [x] `PaymentSplit` interface and `paymentSplits` array in cart store
- [x] Split UI in cart sheet with quick-fill buttons
- [x] API accepts `payment_splits` JSONB via secondary UPDATE
- [x] Receipt shows human-readable split breakdown

### Credit Unification

- [x] Unified standalone credit with split payments (no extra modal)
- [x] Removed old credit state variables (`creditPromptOpen`, etc.)
- [x] Added `isCreditSale`, `activeCreditAmount`, `activeAmountPaid`, `activeCreditStatus`
- [x] Removed credit due date entirely

### End-of-Day (EOD)

- [x] "End of day" button in cash register page
- [x] Physical count input, shortage/overage display
- [x] `submitEod()` creates adjustment entries
- [x] API allows $0 amounts for `entry_type === 'adjustment'`
- [x] `counterBalance` getter on register store

### Bug Fixes

- [x] Fixed `offlineFetch` body serialization (`JSON.stringify()`)
- [x] Fixed Svelte HTML structure error (line 1403)
- [x] Fixed `{@const}` placement error
- [x] Fixed returns API 500 error (`[object Object]` not valid JSON)
- [x] Added SSRF protection with `/api/` allowlist in `offlineFetch`
- [x] Fixed analytics period tabs not responding to clicks

### Documentation

- [x] Created `docs/project.md` — architecture overview
- [x] Created `specs/backlog.md` — this file

## 🔲 Pending / Next

- [ ] Run database migration: `ALTER TABLE sales ADD COLUMN IF NOT EXISTS payment_splits jsonb;`
- [ ] Verify Realtime works in browser
- [ ] Test EOD close flow end-to-end
- [ ] Test unified credit flow end-to-end
- [ ] Test split payment clamping edge cases
- [ ] Test Discount + Round-off fields
- [ ] Fix PWA service worker `ENOENT` build error
- [ ] Add skeleton loading to all data-bound cards (analytics, dashboard, etc.)
