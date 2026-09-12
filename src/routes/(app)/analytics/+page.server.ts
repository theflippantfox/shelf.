/**
 * Analytics page server load — lightweight metadata only.
 * All heavy analytics data is fetched client-side with IDB caching.
 */

export function load({ locals, setHeaders }: { locals: any; setHeaders: (h: Record<string, string>) => void }) {
  setHeaders?.({ "cache-control": "private, max-age=60" });

  const shop = locals.currentShop;
  if (!shop) return {};

  return {
    shopMeta: {
      id: shop.id,
      shopTz: shop.timezone ?? "UTC",
      currency: shop.currency_symbol ?? "$",
    },
  };
}
