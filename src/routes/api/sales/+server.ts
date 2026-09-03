/**
 * /api/sales — list and create sales.
 *
 * GET: paginated list with search, date range, payment method, status filters.
 * POST: create a sale with line items, decrement stock, log movements.
 *       Delegates to a SQL function `create_sale()` for atomicity.
 */
import { json } from '@sveltejs/kit';
import { userClient, userClientFromCtx } from '$lib/server/supabase';

/**
 * GET /api/sales
 */
export async function GET({ cookies, locals, url  }: import('@sveltejs/kit').RequestEvent) {
  if (!locals.currentShop) return json([]);
  const supabase = userClientFromCtx({ cookies } as any);

  const page  = Math.max(1, parseInt(url.searchParams.get('page') ?? '1'));
  const limit = Math.min(200, parseInt(url.searchParams.get('limit') ?? '50'));
  const from  = url.searchParams.get('from');
  const to    = url.searchParams.get('to');
  const method = url.searchParams.get('method');

  let q = supabase
    .from('sales')
    .select('id, sale_ref, total, payment_method, voided_at, created_at, customer:customers(id, name, phone), served_by:profiles!sales_served_by_fkey(first_name, last_name)')
    .eq('shop_id', locals.currentShop.id)
    .order('created_at', { ascending: false })
    .range((page - 1) * limit, page * limit - 1);

  if (from)   q = q.gte('created_at', from);
  if (to)     q = q.lte('created_at', to);
  if (method) q = q.eq('payment_method', method);

  const { data: sales, error } = await q;
  if (error) return json({ error: error.message }, { status: 500 });
  return json(sales ?? []);
}

/**
 * POST /api/sales — create a sale.
 *
 * Uses the `create_sale` RPC function for atomicity. Falls back to a
 * multi-query approach if the function isn't installed yet (older DB).
 */
export async function POST({ cookies, request, locals  }: import('@sveltejs/kit').RequestEvent) {
  if (!locals.currentShop || !locals.user)
    return json({ error: 'No shop' }, { status: 401 });

  const {
    items, customer_id,
    discount_type, discount_value, discount_amount,
    subtotal, total, tax_amount, payment_method, notes,
    created_at,
  } = await request.json();

  if (!items?.length) return json({ error: 'Cart is empty' }, { status: 400 });

  const supabase = userClientFromCtx({ cookies } as any);

  // Atomic via create_sale() SECURITY DEFINER function.
  // Uses userClient so auth.uid() is set inside the function (membership check).
  const { data, error } = await supabase.rpc('create_sale', {
    p_shop_id: locals.currentShop.id,
    p_customer_id: customer_id ?? null,
    p_served_by: locals.user.id,
    p_payment_method: payment_method,
    p_notes: notes ?? null,
    p_subtotal: subtotal,
    p_discount_type: discount_type ?? 'amount',
    p_discount_value: discount_value ?? 0,
    p_discount_amount: discount_amount ?? 0,
    p_tax_amount: tax_amount ?? 0,
    p_total: total,
    p_items: items.map((i: any) => ({
      product_id: i.productId,
      name: i.name,
      sku: i.sku,
      qty: i.qty,
      unit_price: i.unitPrice,
    })),
    // Optional timestamp override (backdated or corrected sale time).
    // When null, the function uses now(). Server validates + applies.
    p_created_at: created_at ?? null,
  });

  if (error) return json({ error: error.message }, { status: 400 });
  return json(data, { status: 201 });
}