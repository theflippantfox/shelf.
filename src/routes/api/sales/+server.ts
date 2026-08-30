/**
 * /api/sales — list and create sales.
 *
 * GET: paginated list with search, date range, payment method, status filters.
 * POST: create a sale with line items, decrement stock, log movements.
 *       Delegates to a SQL function `create_sale()` for atomicity.
 */
import { json } from '@sveltejs/kit';
import { userClient, adminClient } from '$lib/server/supabase';
import { generateSaleRef } from '$lib/utils/sku';

/**
 * GET /api/sales
 */
export async function GET({ locals, url }: import('@sveltejs/kit').RequestEvent) {
  if (!locals.currentShop) return json([]);
  const supabase = userClient({ locals } as any);

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
export async function POST({ request, locals }: import('@sveltejs/kit').RequestEvent) {
  if (!locals.currentShop || !locals.user)
    return json({ error: 'No shop' }, { status: 401 });

  const {
    items, customer_id,
    discount_type, discount_value, discount_amount,
    subtotal, total, tax_amount, payment_method, notes,
  } = await request.json();

  if (!items?.length) return json({ error: 'Cart is empty' }, { status: 400 });

  const admin = adminClient();

  // Try the atomic function first
  const { data, error } = await admin.rpc('create_sale' as any, {
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
  });

  if (!error && data) {
    return json(data, { status: 201 });
  }

  // Fallback: function not installed — use the legacy multi-query path
  console.warn('[sales] rpc create_sale not available, falling back:', error?.message);

  const supabase = userClient({ locals } as any);
  const saleRef = generateSaleRef(locals.currentShop.id);

  const { data: sale, error: saleErr } = await supabase
    .from('sales')
    .insert({
      shop_id: locals.currentShop.id,
      sale_ref: saleRef,
      customer_id: customer_id ?? null,
      served_by: locals.user.id,
      subtotal, discount_type: discount_type ?? 'amount',
      discount_value: discount_value ?? 0,
      discount_amount: discount_amount ?? 0,
      total, tax_amount: tax_amount ?? 0,
      payment_method, notes: notes ?? null,
    })
    .select()
    .single();

  if (saleErr) return json({ error: saleErr.message }, { status: 400 });

  for (const item of items) {
    await supabase.from('sale_items').insert({
      sale_id: sale.id,
      product_id: item.productId,
      product_name: item.name,
      product_sku: item.sku,
      unit_price: item.unitPrice,
      qty: item.qty,
      line_total: item.unitPrice * item.qty,
    });

    const { data: product } = await supabase
      .from('products').select('qty').eq('id', item.productId).single();
    if (product) {
      await supabase.from('products')
        .update({ qty: Math.max(0, (product as any).qty - item.qty) })
        .eq('id', item.productId);
    }

    await supabase.from('stock_log').insert({
      shop_id: locals.currentShop.id,
      product_id: item.productId,
      delta: -item.qty,
      reason: 'sale',
      reference: saleRef,
      created_by: locals.user.id,
    });
  }

  if (customer_id) {
    const { data: cust } = await supabase
      .from('customers').select('visit_count, total_spent').eq('id', customer_id).single();
    if (cust) {
      await supabase.from('customers').update({
        visit_count: ((cust as any).visit_count ?? 0) + 1,
        total_spent: ((cust as any).total_spent ?? 0) + total,
        last_visit: new Date().toISOString(),
      }).eq('id', customer_id);
    }
  }

  return json(sale, { status: 201 });
}