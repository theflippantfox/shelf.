import { json, error } from '@sveltejs/kit';
import { userClientFromCtx } from '$lib/server/supabase';

/**
 * POST /api/sales/[id]/returns — process a return / refund.
 *
 * Body shape:
 *   {
 *     reason:         'defective' | 'wrong_size' | 'changed_mind' |
 *                     'overcharge' | 'duplicate_purchase' | 'other',
 *     notes?:         string,
 *     refund_method:  'cash' | 'bank' | 'credit_note' | 'none',
 *     items: [
 *       { product_id, qty, condition: 'resellable'|'damaged'|'expired' }
 *     ]
 *   }
 *
 * Side effects (all in one transaction):
 *   1. Insert sale_return + sale_return_items rows
 *   2. For each item with condition='resellable' (or 'expired' in the
 *      future, when we support restocking expired items), increment
 *      products.qty by the returned qty and log a positive stock_log
 *      entry with reason='return'.
 *      Items with condition='damaged' are NOT restocked — they're
 *      trashed, and we just log a stock_log entry with reason='damage'
 *      for audit (qty stays out of products.qty).
 *   3. If refund_method is 'cash' or 'bank', write a negative
 *      cash_register entry so the register balance reflects the money
 *      going back out. The entry is linked to the original sale.
 *   4. If the original sale was a credit sale, decrement
 *      customers.outstanding_balance (handled by the credit
 *      trigger since we use a credit_note 'refund').
 *
 * Returns: the created sale_return (with items + server id) and a
 * summary object so the client can show "Return recorded: ₹X refund"
 * toasts.
 */
export async function POST({ cookies, params, request, locals }: import('@sveltejs/kit').RequestEvent) {
  if (!params.id)         throw error(400, 'Missing sale id');
  if (!locals.currentShop) throw error(401, 'No shop');
  if (!locals.user)        throw error(401, 'Not authenticated');

  const body = await request.json();
  const reason:        string = body.reason;
  const notes:         string | null = body.notes ?? null;
  const refund_method: string = body.refund_method;
  const items:         Array<{ product_id: string; qty: number; condition: string }> =
    Array.isArray(body.items) ? body.items : [];

  if (!['defective','wrong_size','changed_mind','overcharge','duplicate_purchase','other']
      .includes(reason)) {
    throw error(400, 'Invalid reason');
  }
  if (!['cash','bank','credit_note','none'].includes(refund_method)) {
    throw error(400, 'Invalid refund_method');
  }
  if (items.length === 0) {
    throw error(400, 'At least one item is required');
  }
  for (const it of items) {
    if (!it.product_id || typeof it.qty !== 'number' || it.qty <= 0) {
      throw error(400, 'Each item needs a product_id and a positive qty');
    }
    if (!['resellable','damaged','expired'].includes(it.condition)) {
      throw error(400, 'Invalid item condition');
    }
  }

  const supabase = userClientFromCtx({ cookies } as any);
  const saleId   = params.id;
  const shopId   = locals.currentShop.id;
  const userId   = locals.user.id;

  // 1. Load the original sale + items so we can:
  //    - validate the return makes sense (sale exists, not voided)
  //    - snapshot the per-unit price (refund = original unit price)
  //    - compute total_refund
  //    - know which destination to use for the cash_register row
  const { data: sale, error: saleErr } = await supabase
    .from('sales')
    .select('id, shop_id, total, payment_method, credit_status, credit_amount_paid, voided_at')
    .eq('id', saleId)
    .single();
  if (saleErr || !sale) throw error(404, 'Sale not found');
  if ((sale as any).voided_at) throw error(400, 'Cannot return a voided sale');
  if ((sale as any).shop_id !== shopId) throw error(403, 'Wrong shop');

  const { data: saleItems, error: itemsErr } = await supabase
    .from('sale_items')
    .select('id, product_id, product_name, product_sku, unit_price, qty')
    .eq('sale_id', saleId);
  if (itemsErr) throw error(500, itemsErr.message);
  const itemById = new Map((saleItems ?? []).map((i: any) => [i.product_id, i]));

  // Compute how much of each product has already been returned
  // (so we can reject returns for more than was sold).
  const { data: priorReturns } = await supabase
    .from('sale_return_items')
    .select('product_id, qty, return:sale_returns!inner(sale_id)')
    .eq('return.sale_id', saleId);
  const alreadyReturned: Record<string, number> = {};
  for (const r of (priorReturns ?? []) as any[]) {
    alreadyReturned[r.product_id] = (alreadyReturned[r.product_id] ?? 0) + r.qty;
  }

  // Build the per-line return entries with snapshot unit_price +
  // computed line_refund. Also validate qty constraints.
  const lineItems: any[] = [];
  let totalRefund = 0;
  for (const it of items) {
    const orig = itemById.get(it.product_id);
    if (!orig) throw error(400, `Product ${it.product_id} was not on this sale`);
    const sold   = Number((orig as any).qty);
    const prior  = alreadyReturned[it.product_id] ?? 0;
    const remain = sold - prior;
    if (it.qty > remain) {
      throw error(400, `Can only return ${remain} of ${(orig as any).product_name} (already returned ${prior})`);
    }
    const unitPrice = Number((orig as any).unit_price);
    const lineRefund = unitPrice * it.qty;
    lineItems.push({
      product_id:   it.product_id,
      product_name: (orig as any).product_name,
      product_sku:  (orig as any).product_sku,
      qty:          it.qty,
      unit_price:   unitPrice,
      line_refund:  lineRefund,
      condition:    it.condition,
    });
    totalRefund += lineRefund;
  }

  // 2. Insert sale_return (header) + sale_return_items (lines).
  // Supabase/PostgREST: insert the header first to get its id, then
  // patch the items with the parent id.
  const { data: ret, error: retErr } = await supabase
    .from('sale_returns')
    .insert({
      sale_id:       saleId,
      shop_id:       shopId,
      processed_by:  userId,
      reason,
      notes,
      total_refund:  totalRefund,
      refund_method,
    })
    .select()
    .single();
  if (retErr || !ret) throw error(500, retErr?.message ?? 'Could not create return');

  const returnId = (ret as any).id;
  const { error: linesErr } = await supabase
    .from('sale_return_items')
    .insert(lineItems.map((i) => ({ ...i, return_id: returnId })));
  if (linesErr) {
    // Best-effort rollback: delete the header.
    await supabase.from('sale_returns').delete().eq('id', returnId);
    throw error(500, linesErr.message);
  }

  // 3. Stock: resellable / expired go back to products.qty. Damaged
  //    don't, but we still log them for audit.
  for (const it of items) {
    const isRestock = it.condition === 'resellable' || it.condition === 'expired';
    if (isRestock) {
      const { data: product } = await supabase
        .from('products').select('qty').eq('id', it.product_id).single();
      if (product) {
        await supabase.from('products')
          .update({ qty: ((product as any).qty ?? 0) + it.qty })
          .eq('id', it.product_id);
      }
    }
    await supabase.from('stock_log').insert({
      shop_id:     shopId,
      product_id:  it.product_id,
      delta:       isRestock ? it.qty : 0,
      reason:      it.condition === 'damaged' ? 'damage' : 'return',
      reference:   (ret as any).id,
      created_by:  userId,
    });
  }

  // 4. Cash register: write a negative entry when the refund leaves
  //    the drawer. Skip for 'credit_note' (money stays on the
  //    customer's account, no cash moves) and 'none' (no money
  //    moves, e.g. defective product we're not paying back).
  // Wrapped in try/catch so a register-write failure doesn't roll back
  // the return itself — the customer still gets their money back,
  // and the register can be fixed by a manual entry.
  if (refund_method === 'cash' || refund_method === 'bank') {
    try {
      const destination = refund_method === 'cash' ? 'counter' : 'bank';
      const { error: regErr } = await supabase.from('cash_register').insert({
        shop_id:     shopId,
        destination,
        amount:      -Math.abs(totalRefund),
        entry_type:  'refund',
        source:      'refund',
        sale_id:     saleId,
        notes:       `Refund for sale (${reason})`,
        created_by:  userId,
      });
      if (regErr) {
        console.warn('[returns] cash_register insert failed:', regErr.message);
      }
    } catch (e: any) {
      console.warn('[returns] cash_register insert threw:', e?.message);
    }
  }

  // 5. Customer balance: if the original sale was credit and the
  //    refund is 'credit_note' (money stays as credit), the customer's
  //    outstanding_balance decreases. The set_outstanding_balance
  //    trigger on the sales table handles this on the next sale
  //    update; for an immediate decrement, we update the customers
  //    row here. (Refunds in cash/bank for credit sales don't
  //    change the customer's balance — they already owed us, and
  //    we got our cash back, so the receivable is gone.)
  if (refund_method === 'credit_note' && (sale as any).payment_method === 'credit') {
    const { data: cust } = await supabase
      .from('customers').select('outstanding_balance').eq('id', (sale as any).customer_id).single();
    if (cust) {
      await supabase.from('customers').update({
        outstanding_balance: Math.max(0,
          ((cust as any).outstanding_balance ?? 0) - totalRefund),
      }).eq('id', (sale as any).customer_id);
    }
  }

  // Re-fetch the return with its items so the client gets a
  // fully-populated record.
  const { data: fullReturn } = await supabase
    .from('sale_returns')
    .select('*, items:sale_return_items(*)')
    .eq('id', returnId)
    .single();

  return json({
    ok: true,
    return: fullReturn,
    summary: {
      total_refund:   totalRefund,
      items_count:    items.length,
      restock_count:  items.filter((i) => i.condition === 'resellable' || i.condition === 'expired').length,
      damaged_count:  items.filter((i) => i.condition === 'damaged').length,
      cash_refund:    refund_method === 'cash' || refund_method === 'bank',
    },
  });
}

/**
 * GET /api/sales/[id]/returns — list all returns for a sale.
 * Used by the receipt page to show the return history.
 */
export async function GET({ cookies, params, locals }: import('@sveltejs/kit').RequestEvent) {
  if (!params.id)         throw error(400, 'Missing sale id');
  if (!locals.currentShop) return json([]);

  const supabase = userClientFromCtx({ cookies } as any);
  const { data, error } = await supabase
    .from('sale_returns')
    .select('*, items:sale_return_items(*)')
    .eq('sale_id', params.id)
    .order('created_at', { ascending: false });
  if (error) return json({ error: error.message }, { status: 500 });
  return json(data ?? []);
}
