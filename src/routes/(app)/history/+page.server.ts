import { adminClient, readItems } from '$lib/server/directus';

const PAGE_SIZE = 25;

export async function load({ locals, url }) {
  const shopId = locals.currentShop!.id;
  const client = adminClient();

  // ── Read URL params ──────────────────────────────────────────────────────
  const page    = Math.max(1, parseInt(url.searchParams.get('page') ?? '1'));
  const q       = (url.searchParams.get('q') ?? '').trim();
  const method  = (url.searchParams.get('method') ?? '').trim();        // '', cash, credit, transfer
  const status  = (url.searchParams.get('status') ?? 'all').trim();     // all, complete, voided
  const range   = (url.searchParams.get('range') ?? 'all').trim();      // all, today, 7d, 30d
  const limit   = PAGE_SIZE;

  // ── Date range ───────────────────────────────────────────────────────────
  const now    = new Date();
  const today0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let from: Date | null = null;
  if (range === 'today') from = today0;
  else if (range === '7d')  from = new Date(today0.getTime() - 6  * 86_400_000);
  else if (range === '30d') from = new Date(today0.getTime() - 29 * 86_400_000);

  // ── Step 1: collect candidate sale IDs that contain a matching item ──────
  //  If the user is searching by item name/SKU we have to traverse sale_items
  //  first, then filter sales by the resulting ID list. This is cheap because
  //  the item filter is selective.
  let itemMatchedIds: string[] | null = null;
  if (q.length > 0) {
    const lower = q.toLowerCase();
    // Try matching product name OR SKU first (the two most common reasons
    // someone searches sales history). If neither yields results we still
    // have the customer/sale_ref fallback below.
    const matchingItems = await client.request(readItems('sale_items', {
      filter: {
        _or: [
          { product_name: { _icontains: lower } },
          { product_sku:  { _icontains: lower } },
        ] as any,
      } as any,
      fields: ['sale'],
      limit: 500,
    })) as any[];

    itemMatchedIds = matchingItems
      .map((i: any) => (typeof i.sale === 'string' ? i.sale : i.sale?.id))
      .filter(Boolean);

    // If neither item nor any of the sale-level fields could match, we'd
    // still search sale-level fields below. Don't pre-empty here.
  }

  // ── Step 2: build the sales filter ───────────────────────────────────────
  const filter: any = { shop: { _eq: shopId } };
  const andClauses: any[] = [];

  if (status === 'complete') andClauses.push({ voided_at: { _null: true } });
  if (status === 'voided')   andClauses.push({ voided_at: { _nnull: true } });
  if (method)                andClauses.push({ payment_method: { _eq: method } });
  if (from)                  andClauses.push({ date_created: { _gte: from.toISOString() } });

  if (q.length > 0) {
    // Sale-level matches (sale_ref, customer name, notes).
    // We DON'T also constrain by item here — `itemMatchedIds === null` means
    // we didn't do the lookup, and `itemMatchedIds.length === 0` means items
    // returned nothing so no sale can match the item side of the OR.
    const saleLevel: any = { _or: [
      { sale_ref:    { _icontains: q } },
      { customer:    { name: { _icontains: q } } },
    ] };
    if (itemMatchedIds && itemMatchedIds.length > 0) {
      saleLevel._or.push({ id: { _in: itemMatchedIds } });
    }
    andClauses.push(saleLevel);
  }

  if (andClauses.length === 1) {
    Object.assign(filter, andClauses[0]);
  } else if (andClauses.length > 1) {
    filter._and = andClauses;
  }

  // ── Step 3: fetch ─────────────────────────────────────────────────────────
  const sales = await client.request(readItems('sales', {
    filter: filter as any,
    fields: [
      'id', 'sale_ref', 'total', 'payment_method', 'subtotal',
      'voided_at', 'date_created', 'void_reason',
      'customer.name',
      'served_by.first_name', 'served_by.last_name',
    ],
    sort: ['-date_created'],
    page,
    limit,
  })) as any[];

  // ── Step 4: lightweight counts for the filter chips ──────────────────────
  //  We don't query the full filtered list — a single Directus aggregation
  //  per dimension would be the proper solution, but for a small shop a
  //  per-status count with the same filters minus `status` is good enough.
  async function countWhere(extra: any): Promise<number> {
    const f: any = { ...filter, ...extra };
    if (extra._and) {
      f._and = [...(filter._and ?? []), ...extra._and];
      delete f._and; // we'll rebuild below
    }
    // Apply the extra clauses as AND on top of existing filter
    const clauses: any[] = [];
    if (filter._and) clauses.push(...filter._and); else {
      const { _and, ...rest } = filter;
      clauses.push(rest);
    }
    if (extra._and) clauses.push(...extra._and); else clauses.push(extra);
    const f2: any = clauses.length === 1 ? clauses[0] : { _and: clauses };
    // Page-size 1 with meta.total would be ideal but the SDK helper returns
    // an array. Use a small head-fetch instead.
    const sample = await client.request(readItems('sales', {
      filter: f2,
      fields: ['id'],
      limit: 9999,
    })) as any[];
    return sample.length;
  }

  // Total matching across all statuses (ignoring the status chip itself).
  const totalMatching = await countWhere({});

  // Status chip counts — re-apply current filter but force each status value.
  const countComplete = await countWhere({ voided_at: { _null: true } });
  const countVoided   = await countWhere({ voided_at: { _nnull: true } });

  return {
    sales,
    page,
    limit,
    totalMatching,
    counts: { all: totalMatching, complete: countComplete, voided: countVoided },
    filters: { q, method, status, range },
  };
}