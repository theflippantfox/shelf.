/**
 * /restocking/orders — list of all purchase orders for the current shop.
 * Filters: status (all/draft/ordered/partial/received/cancelled), supplier, search.
 */
import { userClientFromCtx } from '$lib/server/supabase';

const PAGE_SIZE = 25;

const STATUS_KEYS = ['all', 'draft', 'ordered', 'partial', 'received', 'cancelled'] as const;
type StatusKey = typeof STATUS_KEYS[number];

export async function load({ cookies, locals, url }: import('@sveltejs/kit').RequestEvent) {
  const shopId = locals.currentShop?.id;
  if (!shopId) return { orders: [], suppliers: [], page: 1, limit: PAGE_SIZE, totalMatching: 0, counts: { all: 0 }, filters: { q: '', status: 'all', supplier: '' } };

  const supabase = userClientFromCtx({ cookies } as any);

  const page     = Math.max(1, parseInt(url.searchParams.get('page') ?? '1'));
  const q        = (url.searchParams.get('q') ?? '').trim();
  const status   = (url.searchParams.get('status') ?? 'all').trim() as StatusKey;
  const supplier = (url.searchParams.get('supplier') ?? '').trim();
  const limit    = PAGE_SIZE;

  // Build the orders query
  let ordersQuery = supabase
    .from('purchase_orders')
    .select('id, order_ref, status, order_date, expected_delivery_date, received_date, subtotal, tax_amount, shipping_cost, total_cost, notes, created_at, supplier:suppliers(id, name), created_by:profiles!purchase_orders_created_by_fkey(first_name, last_name), items:purchase_order_items(id)')
    .eq('shop_id', shopId)
    .order('created_at', { ascending: false })
    .range((page - 1) * limit, page * limit - 1);

  if (STATUS_KEYS.includes(status) && status !== 'all') {
    ordersQuery = ordersQuery.eq('status', status);
  }
  if (supplier) {
    ordersQuery = ordersQuery.eq('supplier_id', supplier);
  }
  if (q) {
    // search by order_ref, notes, or supplier name (via the embedded relation)
    ordersQuery = ordersQuery.or(`order_ref.ilike.%${q}%,notes.ilike.%${q}%,supplier.name.ilike.%${q}%`);
  }

  const { data: orders } = await ordersQuery;

  // Pull the list of suppliers for the filter dropdown
  const { data: suppliers } = await supabase
    .from('suppliers')
    .select('id, name')
    .eq('shop_id', shopId)
    .order('name');

  // Counts per status for the chip filter (apply non-status filters so counts reflect current scope)
  async function countWhere(extraStatus?: StatusKey): Promise<number> {
    let q2 = supabase.from('purchase_orders').select('id', { count: 'exact', head: true }).eq('shop_id', shopId);
    if (extraStatus && extraStatus !== 'all') q2 = q2.eq('status', extraStatus);
    if (supplier) q2 = q2.eq('supplier_id', supplier);
    if (q)        q2 = q2.or(`order_ref.ilike.%${q}%,notes.ilike.%${q}%,supplier.name.ilike.%${q}%`);
    const { count } = await q2;
    return count ?? 0;
  }
  const counts: Record<StatusKey, number> = {
    all:       await countWhere('all'),
    draft:     await countWhere('draft'),
    ordered:   await countWhere('ordered'),
    partial:   await countWhere('partial'),
    received:  await countWhere('received'),
    cancelled: await countWhere('cancelled'),
  };

  return {
    orders: orders ?? [],
    suppliers: suppliers ?? [],
    page, limit,
    totalMatching: counts.all,
    counts,
    filters: { q, status, supplier },
  };
}
