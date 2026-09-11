/**
 * +page.ts for Inventory — cache-first layer over server data.
 *
 * Pattern: first visit gets SSR data from +page.server.ts, written to
 * IndexedDB in background. Subsequent visits read from IndexedDB instantly.
 */

import { browser } from "$app/environment";

export const load = async ({ data, url }: any) => {
  if (!browser) return data;

  const { getShopKey } = await import("$lib/offline/cacheFirst");
  const cacheKey = `${getShopKey()}:inventory:list`;

  try {
    const { cacheFirst, cache } = await import("$lib/offline/cacheFirst");

    const result = await cacheFirst<any>(
      "products",
      cacheKey,
      () => Promise.resolve(null),
      { maxAge: 30_000, label: "inventory" },
    );

    if (result.data) {
      if (result.refreshing && data?.products) {
        cache.write("products", cacheKey, data.products).catch(() => {});
      }
      return {
        ...data,
        products: result.data.products ?? data?.products,
        categories: result.data.categories ?? data?.categories,
        fromCache: true,
        refreshing: result.refreshing,
      };
    }
  } catch {
    /* cache unavailable */
  }

  // Cache cold — use server data, populate cache in background
  if (data?.products || data?.categories) {
    try {
      const { cache } = await import("$lib/offline/cacheFirst");
      cache
        .write("products", cacheKey, {
          products: data.products,
          categories: data.categories,
        })
        .catch(() => {});
    } catch {
      /* non-fatal */
    }
  }

  return { ...data, fromCache: false, refreshing: false };
};
