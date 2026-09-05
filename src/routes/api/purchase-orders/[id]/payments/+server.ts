import { json, error } from '@sveltejs/kit';
import { userClientFromCtx } from '$lib/server/supabase';

/**
 * GET /api/purchase-orders/[id]/payments — list all payments for a PO.
 * Returns the payment rows + the supplier's outstanding balance.
 */
export async function GET({ cookies, params, locals }: import('@sveltejs/kit').RequestEvent) {
  if (!params.id)          throw error(400, 'Missing purchase order id');
  if (!locals.currentShop) throw error(401, 'No shop');

  const supabase = userClientFromCtx({ cookies } as any);
  const [{ data: payments }, { data: po }] = await Promise.all([
    supabase
      .from('purchase_order_payments')
      .select('*')
      .eq('purchase_order_id', params.id)
      .order('paid_at', { ascending: false }),
    supabase
      .from('purchase_orders')
      .select('shop_id, supplier_id, total_cost, status')
      .eq('id', params.id)
      .single(),
  ]);
  return json({ payments: payments ?? [], po });
}

/**
 * POST /api/purchase-orders/[id]/payments — record a payment.
 *
 * Body:
 *   {
 *     amount:        number  (positive, must not exceed the PO total minus prior payments)
 *     method:        'cash' | 'bank' | 'credit' | 'adjustment'
 *     notes?:        string
 *     client_request_id?: string  // for idempotency on retry
 *   }
 *
 * Side effects (all in one HTTP request, no transaction wrapper):
 *   1. Insert purchase_order_payments row.
 *   2. If method = 'cash' or 'bank': write a negative cash_register row
 *      so the register balance reflects the money going out.
 *   3. (Future) If the PO is fully paid, flip its status to 'received'
 *      (for now we leave status as-is — receiving is a separate flow).
 */
export async function POST({ cookies, params, request, locals }: import('@sveltejs/kit').RequestEvent) {
  if (!params.id)          throw error(400, 'Missing purchase order id');
  if (!locals.currentShop) throw error(401, 'No shop');
  if (!locals.user)        throw error(401, 'Not authenticated');

  const body = await request.json();
  const amount = Number(body.amount ?? 0);
  if (!isFinite(amount) || amount <= 0) {
    throw error(400, 'Amount must be a positive number');
  }
  const method = String(body.method ?? '');
  if (!['cash','bank','credit','adjustment'].includes(method)) {
    throw error(400, 'Invalid method');
  }
  const notes  = body.notes ? String(body.notes) : null;
  const clientRequestId = body.client_request_id ? String(body.client_request_id) : null;

  const supabase = userClientFromCtx({ cookies } as any);
  const shopId   = locals.currentShop.id;
  const userId   = locals.user.id;
  const poId     = params.id;

  // 1. Load the PO so we know the shop + supplier + remaining balance
  const { data: po, error: poErr } = await supabase
    .from('purchase_orders')
    .select('id, shop_id, total_cost, status')
    .eq('id', poId)
    .single();
  if (poErr || !po) throw error(404, 'Purchase order not found');
  if ((po as any).shop_id !== shopId) throw error(403, 'Wrong shop');

  // 2. Compute how much is already paid (sum of payments for this PO)
  const { data: prior } = await supabase
    .from('purchase_order_payments')
    .select('amount')
    .eq('purchase_order_id', poId);
  const paidSoFar = (prior ?? []).reduce((s, r: any) => s + Number(r.amount ?? 0), 0);
  const remaining = Number((po as any).total_cost ?? 0) - paidSoFar;
  if (amount > remaining + 0.005) {
    throw error(400, `Amount exceeds remaining balance (${remaining.toFixed(2)})`);
  }

  // 3. If method is cash or bank, write a negative cash_register row
  //    (register the money going out). Wrapped in try/catch so a
  //    register-write failure doesn't roll back the payment.
  let registerEntryId: string | null = null;
  if (method === 'cash' || method === 'bank') {
    try {
      const destination = method === 'cash' ? 'counter' : 'bank';
      const { data: reg, error: regErr } = await supabase
        .from('cash_register')
        .insert({
          shop_id:     shopId,
          destination,
          amount:      -Math.abs(amount),
          entry_type:  'expense',
          source:      'manual',                  // supplier payments are manual
          notes:       `Payment to supplier (PO ${poId.slice(0, 8)})`,
          created_by:  userId,
        })
        .select('id')
        .single();
      if (regErr) {
        console.warn('[po-payments] cash_register insert failed:', regErr.message);
      } else if (reg) {
        registerEntryId = (reg as any).id;
      }
    } catch (e: any) {
      console.warn('[po-payments] cash_register insert threw:', e?.message);
    }
  }

  // 4. Insert the payment row. client_request_id is unique so a
  //    client retry doesn't double-pay.
  const insertPayload: any = {
    purchase_order_id: poId,
    shop_id:           shopId,
    amount,
    method,
    notes,
    paid_by:           userId,
    register_entry_id: registerEntryId,
  };
  if (clientRequestId) insertPayload.client_request_id = clientRequestId;

  const { data: payment, error: payErr } = await supabase
    .from('purchase_order_payments')
    .insert(insertPayload)
    .select()
    .single();
  if (payErr) {
    // If we managed to write a register row but the payment insert
    // failed (e.g. duplicate client_request_id), roll the register
    // back. We can't really "delete" a register row (append-only
    // design) but we can write a compensating 'adjustment' row.
    if (registerEntryId) {
      try {
        const { data: comp, error: compErr } = await supabase.from('cash_register').insert({
          shop_id:     shopId,
          destination: method === 'cash' ? 'counter' : 'bank',
          amount:      Math.abs(amount),            // positive = reverse the negative
          entry_type:  'adjustment',
          source:      'manual',
          notes:       `Reversal of duplicate payment (PO ${poId.slice(0, 8)})`,
          created_by:  userId,
        }).select('id').single();
        if (compErr) console.warn('[po-payments] compensation insert failed:', compErr.message);
        else console.log('[po-payments] wrote compensating register row', (comp as any)?.id);
      } catch { /* swallow */ }
    }
    // 23505 = unique violation (duplicate client_request_id). Treat
    // as success — the row already exists, that's the whole point.
    if (payErr.code === '23505' && clientRequestId) {
      return json({ ok: true, deduped: true });
    }
    throw error(500, payErr.message);
  }

  // 5. Update PO status if fully paid
  const newPaidTotal = paidSoFar + amount;
  const total = Number((po as any).total_cost ?? 0);
  if (Math.abs(newPaidTotal - total) < 0.005 && (po as any).status !== 'received') {
    // Don't override a 'received' status (the user has confirmed
    // stock arrived). For other statuses, mark as 'received' if
    // fully paid.
    await supabase
      .from('purchase_orders')
      .update({ status: 'received', received_date: new Date().toISOString().slice(0, 10) })
      .eq('id', poId);
  }

  return json({ ok: true, payment });
}
