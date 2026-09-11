/**
 * +page.ts for Customers — cache-first layer over server data.
 */

import { browser } from "$app/environment";

export const load = async ({ data }: any) => {
  if (!browser) return data;

  const { getShopKey } = await import("$lib/offline/cacheFirst");
  const cacheKey = `${getShopKey()}:customers:list`;

  try {
    const { cacheFirst, cache } = await import("$lib/offline/cacheFirst");

    const result = await cacheFirst<any>(
      "customers",
      cacheKey,
      () => Promise.resolve(null),
      { maxAge: 30_000, label: "customers" },
    );

    if (result.data) {
      if (result.refreshing && data?.customers) {
        cache.write("customers", cacheKey, data.customers).catch(() => {});
      }
      return {
        ...data,
        customers: result.data ?? data?.customers,
        fromCache: true,
        refreshing: result.refreshing,
      };
    }
  } catch {
    /* cache unavailable */
  }

  if (data?.customers) {
    try {
      const { cache } = await import("$lib/offline/cacheFirst");
      cache.write("customers", cacheKey, data.customers).catch(() => {});
    } catch {
      /* non-fatal */
    }
  }

  return { ...data, fromCache: false, refreshing: false };
};
