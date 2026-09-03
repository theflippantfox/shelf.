/**
 * /api/sales/[id] — get, void, or edit a sale.
 *
 * GET: returns the sale + line items
 * PATCH: two paths — void (refund stock) or edit (sync line items + customer totals)
 *
 * The edit path is a complex multi-step sync. Race conditions exist; this is
 * a known issue and will be addressed in Stage 6a by moving to a Postgres function.
 */
import { json } from '@sveltejs/kit';
import { userClient, userClientFromCtx } from '$lib/server/supabase';

/**
 * GET /api/sales/[id]
 */
export async function GET({ cookies, params, locals  }: import('@sveltejs/kit').RequestEvent) {
  if (!params.id) return json({ error: 'Missing id' }, { status: 400 });
  const supabase = userClientFromCtx({ cookies } as any);

  const [
    { data: sale, error: saleErr },
    { data: items, error: itemsErr },
  ] = await Promise.all([
    supabase.from('sales')
      .select('*, customer:customers(*), served_by:profiles!sales_served_by_fkey(first_name, last_name, avatar_url)')
      .eq('id', params.id)
      .single(),
    supabase.from('sale_items')
      .select('*')
      .eq('sale_id', params.id),
  ]);

  if (saleErr || itemsErr)
    return json({ error: saleErr?.message ?? itemsErr?.message }, { status: 404 });
  return json({ ...sale, items });
}

/**
 * PATCH /api/sales/[id]
 */
export async function PATCH({ cookies, params, request, locals  }: import('@sveltejs/kit').RequestEvent) {
  if (!params.id) return json({ error: 'Missing id' }, { status: 400 });
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const supabase = userClientFromCtx({ cookies } as any);

  // ── Void path ──────────────────────────────────────────────────────────────
  if (body.void_reason !== undefined) {
    const { data: sale, error: saleErr } = await supabase
      .from('sales')
      .update({
        voided_at:   new Date().toISOString(),
        voided_by:   locals.user.id,
        void_reason: body.void_reason ?? '',
      })
      .eq('id', params.id)
      .select()
      .single();
    if (saleErr) return json({ error: saleErr.message }, { status: 400 });

    const { data: items } = await supabase
      .from('sale_items').select('*').eq('sale_id', params.id);

    for (const item of items ?? []) {
      const { data: product } = await supabase
        .from('products').select('qty').eq('id', item.product_id).single();
      if (product) {
        await supabase.from('products')
          .update({ qty: ((product as any).qty ?? 0) + item.qty })
          .eq('id', item.product_id);
      }
      await supabase.from('stock_log').insert({
        shop_id: (sale as any).shop_id,
        product_id: item.product_id,
        delta: item.qty,
        reason: 'void',
        reference: (sale as any).sale_ref,
        created_by: locals.user.id,
      });
    }
    return json({ ok: true });
  }

  // ── Edit path ──────────────────────────────────────────────────────────────
  const { data: sale, error: readErr } = await supabase
    .from('sales')
    .select('*, customer:customers(*)')
    .eq('id', params.id)
    .single();
  if (readErr) return json({ error: readErr.message }, { status: 400 });

  const oldCustomerId = typeof (sale as any).customer_id === 'string'
    ? (sale as any).customer_id
    : ((sale as any).customer_id as any)?.id;
  const oldTotal = (sale as any).total;

  await supabase.from('sales').update({
    customer_id: body.customer_id ?? (sale as any).customer_id,
    discount_type: body.discount_type,
    discount_value: body.discount_value,
    discount_amount: body.discount_amount,
    subtotal: body.subtotal,
    total: body.total,
    tax_amount: body.tax_amount,
    payment_method: body.payment_method,
    notes: body.notes ?? (sale as any).notes,
  }).eq('id', params.id);

  // Optional: update the sale's created_at. Done via RPC because we
  // also need to bump the matching stock_log rows so analytics stay
  // consistent. The RPC is no-op if the timestamp didn't change.
  if (body.created_at && body.created_at !== (sale as any).created_at) {
    const { error: tsErr } = await supabase.rpc('set_sale_timestamp', {
      p_sale_id: params.id,
      p_created_at: body.created_at,
    });
    if (tsErr) {
      // Don't fail the whole edit — the timestamp is a non-critical
      // override. The sale edit still succeeded.
      console.warn('set_sale_timestamp failed:', tsErr.message);
    }
  }

  // Sync line items
  const { data: currentItems = [] } = await supabase
    .from('sale_items')
    .select('id, product_id, qty, product_name, product_sku, unit_price')
    .eq('sale_id', params.id);

  const oldMap = new Map((currentItems as any[]).map((i) => [i.product_id, i]));
  const newItems: any[] = (body.items ?? []) as any[];
  const newMap = new Map(newItems.map((i: any) => [i.productId, i]));

  // Removed items → restore stock, delete records, log
  for (const [productId, oldItem] of oldMap) {
    if (!newMap.has(productId)) {
      const { data: product } = await supabase
        .from('products').select('qty').eq('id', productId).single();
      if (product) {
        await supabase.from('products')
          .update({ qty: ((product as any).qty ?? 0) + oldItem.qty })
          .eq('id', productId);
      }
      await supabase.from('stock_log').insert({
        shop_id: (sale as any).shop_id,
        product_id: productId,
        delta: oldItem.qty,
        reason: 'sale',
        reference: (sale as any).sale_ref,
        created_by: locals.user.id,
      });
      await supabase.from('sale_items').delete().eq('id', oldItem.id);
    }
  }

  // Added / updated items
  for (const [productId, newItem] of newMap) {
    const oldItem = oldMap.get(productId);
    if (!oldItem) {
      const { data: product } = await supabase
        .from('products').select('qty').eq('id', productId).single();
      if (product) {
        await supabase.from('products')
          .update({ qty: Math.max(0, ((product as any).qty ?? 0) - newItem.qty) })
          .eq('id', productId);
      }
      await supabase.from('sale_items').insert({
        sale_id: params.id,
        product_id: productId,
        product_name: newItem.name,
        product_sku: newItem.sku,
        unit_price: newItem.unitPrice,
        qty: newItem.qty,
        line_total: newItem.unitPrice * newItem.qty,
      });
      await supabase.from('stock_log').insert({
        shop_id: (sale as any).shop_id,
        product_id: productId,
        delta: -newItem.qty,
        reason: 'sale',
        reference: (sale as any).sale_ref,
        created_by: locals.user.id,
      });
    } else if (oldItem.qty !== newItem.qty) {
      const delta = oldItem.qty - newItem.qty;
      const { data: product } = await supabase
        .from('products').select('qty').eq('id', productId).single();
      if (product) {
        await supabase.from('products')
          .update({ qty: Math.max(0, ((product as any).qty ?? 0) + delta) })
          .eq('id', productId);
      }
      await supabase.from('stock_log').insert({
        shop_id: (sale as any).shop_id,
        product_id: productId,
        delta,
        reason: 'sale',
        reference: (sale as any).sale_ref,
        created_by: locals.user.id,
      });
      await supabase.from('sale_items').update({
        qty: newItem.qty,
        line_total: newItem.unitPrice * newItem.qty,
      }).eq('id', oldItem.id);
    }
  }

  // Adjust customer totals
  const newCustomerId = body.customer_id ?? oldCustomerId;
  const totalDelta = body.total - oldTotal;

  if (oldCustomerId && newCustomerId && oldCustomerId !== newCustomerId) {
    const { data: oldCust } = await supabase
      .from('customers').select('total_spent').eq('id', oldCustomerId).single();
    if (oldCust) {
      await supabase.from('customers').update({
        total_spent: Math.max(0, ((oldCust as any).total_spent ?? 0) - oldTotal),
      }).eq('id', oldCustomerId);
    }
    const { data: newCust } = await supabase
      .from('customers').select('total_spent').eq('id', newCustomerId).single();
    if (newCust) {
      await supabase.from('customers').update({
        total_spent: ((newCust as any).total_spent ?? 0) + body.total,
      }).eq('id', newCustomerId);
    }
  } else if (newCustomerId) {
    const { data: cust } = await supabase
      .from('customers').select('total_spent').eq('id', newCustomerId).single();
    if (cust) {
      await supabase.from('customers').update({
        total_spent: ((cust as any).total_spent ?? 0) + totalDelta,
      }).eq('id', newCustomerId);
    }
  }

  const { data: updated } = await supabase
    .from('sales')
    .select('*, customer:customers(*), served_by:profiles!sales_served_by_fkey(first_name, last_name, avatar_url)')
    .eq('id', params.id)
    .single();
  return json(updated);
}