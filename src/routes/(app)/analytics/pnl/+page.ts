/**
 * +page.ts for P&L analytics.
 *
 * Implements SWR (stale-while-revalidate) for instant page loads:
 *
 *   - Client-side (browser): check IndexedDB FIRST → if cached, use it and
 *     refresh in background. If cache miss, use server data and populate cache.
 *   - Server-side: return empty (server data comes from +page.server.ts)
 */

import { browser } from '$app/environment';

export const load = async ({ data, url }: any) => {
  // Only run the cache layer in the browser
  if (!browser) return data;

  const period = url.searchParams.get('period') ?? '7d';
  const tab    = url.searchParams.get('tab')    ?? 'calendar';
  const month  = url.searchParams.get('month')   ?? '';
  const cacheKey = `pnl:${period}:${tab}:${month}`;

  try {
    const { cacheFirst, cache } = await import('$lib/offline/cacheFirst');

    const result = await cacheFirst(
      'sale_items',
      cacheKey,
      () => Promise.resolve(null),  // fetcher called only on cache miss
      { maxAge: 30_000, label: 'pnl' },
    );

    if (result.data) {
      // Cache hit — show cached data immediately.
      // If it was a stale hit (refreshing=true), write server data to
      // cache in background so the NEXT visit gets fresh data.
      if (result.refreshing && data?.pnl) {
        cache.write('sale_items', cacheKey, data.pnl).catch(() => {});
      }
      return { ...data, pnl: result.data, fromCache: true, refreshing: result.refreshing };
    }
  } catch {
    // Cache unavailable — fall through to server data
  }

  // Cache cold — use server data, populate cache in background for next visit
  if (data?.pnl) {
    try {
      const { cache } = await import('$lib/offline/cacheFirst');
      cache.write('sale_items', cacheKey, data.pnl).catch(() => {});
    } catch { /* non-fatal */ }
  }

  return { ...data, fromCache: false, refreshing: false };
};
