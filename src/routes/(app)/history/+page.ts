/**
 * +page.ts for Sales History — cache-first layer over server data.
 *
 * Cache key includes all filter params so each filter combo is cached separately.
 */

import { browser } from '$app/environment';

export const load = async ({ data, url }: any) => {
  if (!browser) return data;

  // Build cache key from URL filter params
  const page   = url.searchParams.get('page')   ?? '1';
  const q      = url.searchParams.get('q')      ?? '';
  const method = url.searchParams.get('method') ?? '';
  const status = url.searchParams.get('status') ?? 'all';
  const credit = url.searchParams.get('credit') ?? 'all';
  const range  = url.searchParams.get('range')  ?? 'all';
  const cacheKey = `history:${page}:${q}:${method}:${status}:${credit}:${range}`;

  try {
    const { cacheFirst, cache } = await import('$lib/offline/cacheFirst');

    const result = await cacheFirst(
      'sale_items',   // reuse existing store
      cacheKey,
      () => Promise.resolve(null),
      { maxAge: 30_000, label: 'history' },
    );

    if (result.data) {
      if (result.refreshing && data?.sales) {
        cache.write('sale_items', cacheKey, {
          sales: data.sales,
          totalMatching: data.totalMatching,
          counts: data.counts,
        }).catch(() => {});
      }
      return {
        ...data,
        sales:        result.data.sales        ?? data?.sales,
        totalMatching: result.data.totalMatching ?? data?.totalMatching,
        counts:       result.data.counts       ?? data?.counts,
        fromCache:    true,
        refreshing:   result.refreshing,
      };
    }
  } catch { /* cache unavailable */ }

  if (data?.sales) {
    try {
      const { cache } = await import('$lib/offline/cacheFirst');
      cache.write('sale_items', cacheKey, {
        sales: data.sales,
        totalMatching: data.totalMatching,
        counts: data.counts,
      }).catch(() => {});
    } catch { /* non-fatal */ }
  }

  return { ...data, fromCache: false, refreshing: false };
};
