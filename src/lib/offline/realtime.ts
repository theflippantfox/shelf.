/**
 * Realtime subscription manager.
 *
 * Subscribes to Supabase Postgres changes on key tables and
 * keeps the IndexedDB cache + Svelte stores in sync when
 * another device/user mutates data.
 *
 * Design:
 *   - One channel per shop, with table-level filters on shop_id.
 *   - Each INSERT/UPDATE/DELETE patches the relevant IDB store
 *     and Svelte store immediately.
 *   - Analytics cache is invalidated (not rebuilt) — the next
 *     page visit triggers a fresh fetch.
 *   - Reconnection is handled by Supabase's built-in retry.
 *   - Only runs in the browser; no-op on SSR.
 */
import { browser } from "$app/environment";
import { getBrowserSupabase } from "$lib/supabase-browser";
import { getDb } from "$lib/offline/offlineDb";
import { inventory } from "$lib/stores/inventory.svelte";
import { customers } from "$lib/stores/customers.svelte";
import { currentShop } from "$lib/stores/shop.svelte";
import type {
  RealtimeChannel,
  RealtimePostgresChangesPayload,
} from "@supabase/supabase-js";

/* ──────────────────────────────────────────────────────────────────
 * Types
 * ──────────────────────────────────────────────────────────────── */

type ChangePayload<T extends { [key: string]: any } = any> =
  RealtimePostgresChangesPayload<T>;

/* ──────────────────────────────────────────────────────────────────
 * State
 * ──────────────────────────────────────────────────────────────── */

let _channel: RealtimeChannel | null = null;
let _shopId: string | null = null;

/* ──────────────────────────────────────────────────────────────────
 * Table handlers
 * ──────────────────────────────────────────────────────────────── */

/**
 * Handle product INSERT/UPDATE/DELETE.
 * Writes through to IDB + updates the inventory store.
 */
async function handleProductChange(payload: ChangePayload) {
  const { eventType, new: newRow, old: oldRow } = payload;
  const db = await getDb();

  if (eventType === "INSERT" || eventType === "UPDATE") {
    const row = { ...newRow, _cached_at: Date.now() };
    await db.put("products", row);
    // Update the in-memory store
    if (eventType === "INSERT") {
      inventory.add(row);
    } else {
      inventory.update(row.id, row);
    }
  } else if (eventType === "DELETE") {
    const id = oldRow?.id;
    if (id) {
      await db.delete("products", id);
      inventory.remove(id);
    }
  }
}

/**
 * Handle customer INSERT/UPDATE/DELETE.
 * Writes through to IDB + updates the customers store.
 */
async function handleCustomerChange(payload: ChangePayload) {
  const { eventType, new: newRow, old: oldRow } = payload;
  const db = await getDb();

  if (eventType === "INSERT" || eventType === "UPDATE") {
    const row = { ...newRow, _cached_at: Date.now() };
    await db.put("customers", row);
    if (eventType === "INSERT") {
      customers.add(row);
    } else {
      customers.update(row.id, row);
    }
  } else if (eventType === "DELETE") {
    const id = oldRow?.id;
    if (id) {
      await db.delete("customers", id);
      customers.remove(id);
    }
  }
}

/**
 * Handle sale INSERT/UPDATE (new sale or void).
 * Invalidates analytics cache + refreshes register cache.
 */
async function handleSaleChange(_payload: ChangePayload) {
  // A new sale affects analytics, register, and customer balances.
  // We don't rebuild analytics inline (too expensive) — just
  // invalidate the cached entries so the next analytics page
  // visit fetches fresh data.
  await invalidateAnalyticsCache();

  // Also refresh register entries since sales affect the register.
  if (browser) {
    const { offlineSync } = await import("$lib/offline/offlineSync.svelte");
    // Gentle refresh — don't hammer the server
    void offlineSync.refreshRegisterCache();
  }
}

/**
 * Handle category INSERT/UPDATE/DELETE.
 * Writes through to IDB.
 */
async function handleCategoryChange(payload: ChangePayload) {
  const { eventType, new: newRow, old: oldRow } = payload;
  const db = await getDb();

  if (eventType === "INSERT" || eventType === "UPDATE") {
    const row = { ...newRow, _cached_at: Date.now() };
    await db.put("categories", row);
  } else if (eventType === "DELETE") {
    const id = oldRow?.id;
    if (id) await db.delete("categories", id);
  }
}

/* ──────────────────────────────────────────────────────────────────
 * Analytics cache invalidation
 * ──────────────────────────────────────────────────────────────── */

/**
 * Clear all cached analytics entries so the next page visit
 * triggers a fresh fetch from the API.
 */
async function invalidateAnalyticsCache(): Promise<void> {
  try {
    const db = await getDb();
    await db.clear("analytics_cache");
  } catch {
    /* non-fatal */
  }
}

/* ──────────────────────────────────────────────────────────────────
 * Channel lifecycle
 * ──────────────────────────────────────────────────────────────── */

/**
 * Subscribe to all relevant table changes for the current shop.
 * Safe to call multiple times — tears down any existing channel first.
 */
export function subscribeToRealtime(): void {
  if (!browser) return;

  const shop = currentShop.data;
  const shopId = shop?.id;
  if (!shopId) {
    // No shop yet — can't subscribe. Will retry when shop loads.
    return;
  }

  // Already subscribed to this shop
  if (_channel && _shopId === shopId) return;

  // Tear down old channel if shop changed
  unsubscribeFromRealtime();

  const supabase = getBrowserSupabase();
  _shopId = shopId;

  _channel = supabase
    .channel(`shop:${shopId}`)
    // ── products ──
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "products",
        filter: `shop_id=eq.${shopId}`,
      },
      (payload) => void handleProductChange(payload),
    )
    // ── customers ──
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "customers",
        filter: `shop_id=eq.${shopId}`,
      },
      (payload) => void handleCustomerChange(payload),
    )
    // ── sales ──
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "sales",
        filter: `shop_id=eq.${shopId}`,
      },
      (payload) => void handleSaleChange(payload),
    )
    // ── categories ──
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "categories",
        filter: `shop_id=eq.${shopId}`,
      },
      (payload) => void handleCategoryChange(payload),
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        console.log(`[realtime] subscribed to shop ${shopId}`);
      } else if (status === "CHANNEL_ERROR") {
        console.warn("[realtime] channel error — will retry on reconnect");
      }
    });
}

/**
 * Tear down the current Realtime subscription.
 */
export function unsubscribeFromRealtime(): void {
  if (_channel) {
    const supabase = getBrowserSupabase();
    supabase.removeChannel(_channel);
    _channel = null;
    _shopId = null;
  }
}

/**
 * Re-subscribe (e.g. after a shop switch).
 */
export function resubscribeToRealtime(): void {
  unsubscribeFromRealtime();
  subscribeToRealtime();
}
