import { json, error } from '@sveltejs/kit';
import { userClientFromCtx } from '$lib/server/supabase';

/**
 * GET /api/expenses — list non-PO expenses for the current shop.
 *
 * The cash register already has a 'manual' source for entries typed
 * in by hand. We re-use it for non-PO expenses: a "record expense"
 * sheet on the cash register page calls this endpoint, which writes
 * a negative cash_register row tagged with category + description.
 *
 * This endpoint is the LIST + SUMMARY for that. There's no separate
 * 'expenses' table — the cash_register row IS the expense (the
 * `category` field is stored in `notes` as JSON). The endpoint just
 * gives the UI a cleaner shape: { items, total, byCategory }.
 *
 *   ?from=YYYY-MM-DD   (default: 30 days ago)
 *   ?to=YYYY-MM-DD     (default: today)
 */
export async function GET({ cookies, locals, url }: import('@sveltejs/kit').RequestEvent) {
  if (!locals.currentShop) throw error(401, 'No shop');

  const supabase = userClientFromCtx({ cookies } as any);
  const shopId   = locals.currentShop.id;

  // Default window: last 30 days
  const today    = new Date();
  const defFrom  = new Date(today.getTime() - 30 * 86_400_000);
  const from     = url.searchParams.get('from') ?? defFrom.toISOString().slice(0, 10);
  const to       = url.searchParams.get('to')   ?? today.toISOString().slice(0, 10);

  // Source = 'manual' (hand-typed entries) or 'refund' (refunds).
  // Both are "money going in or out" — for the expense summary we
  // focus on the negative-direction entries (expense, transfer-out).
  // We exclude 'sale' and 'void' and 'credit_payment' since those
  // are tracked separately.
  const { data: rows, error: listErr } = await supabase
    .from('cash_register')
    .select('id, amount, entry_type, source, notes, destination, created_at')
    .eq('shop_id', shopId)
    .in('entry_type', ['expense', 'adjustment'])
    .gte('created_at', `${from}T00:00:00`)
    .lte('created_at', `${to}T23:59:59`)
    .order('created_at', { ascending: false })
    .limit(200);
  if (listErr) throw error(500, listErr.message);

  // Aggregate by category (parsed from notes prefix "category:rent")
  const byCategory: Record<string, number> = {};
  let total = 0;
  for (const r of (rows ?? []) as any[]) {
    total += Number(r.amount ?? 0);
    const cat = parseCategoryFromNotes(r.notes);
    byCategory[cat] = (byCategory[cat] ?? 0) + Number(r.amount ?? 0);
  }

  return json({
    items:       rows ?? [],
    total,
    byCategory:  Object.entries(byCategory).map(([category, amount]) => ({ category, amount })),
    from, to,
  });
}

/**
 * POST /api/expenses — record a non-PO expense.
 *
 * Body:
 *   {
 *     amount:     number  (positive; sign is inferred from direction)
 *     category:   string  ('rent' | 'utilities' | 'salary' | 'supplies'
 *                           | 'transport' | 'maintenance' | 'marketing'
 *                           | 'tax' | 'other')
 *     description:string
 *     method:     'cash' | 'bank'  (default 'cash')
 *   }
 *
 * Writes a negative cash_register row with notes="category:xxx | desc".
 * The expense ends up in the cash register history + the expense
 * summary above.
 */
export async function POST({ cookies, request, locals }: import('@sveltejs/kit').RequestEvent) {
  if (!locals.currentShop) throw error(401, 'No shop');
  if (!locals.user)        throw error(401, 'Not authenticated');

  const body = await request.json();
  const amount      = Number(body.amount ?? 0);
  const category    = String(body.category ?? 'other').toLowerCase();
  const description = String(body.description ?? '').trim();
  const method      = String(body.method   ?? 'cash');

  if (!isFinite(amount) || amount <= 0)  throw error(400, 'Amount must be a positive number');
  if (!['cash','bank'].includes(method))  throw error(400, 'method must be cash or bank');
  if (!description)                      throw error(400, 'description is required');
  if (description.length > 200)          throw error(400, 'description too long (max 200 chars)');

  const supabase = userClientFromCtx({ cookies } as any);
  const shopId   = locals.currentShop.id;
  const userId   = locals.user.id;

  // Tag the entry so we can group by category in GET /api/expenses.
  const notes = `category:${category} | ${description}`;

  const { data, error: insertErr } = await supabase
    .from('cash_register')
    .insert({
      shop_id:     shopId,
      destination: method === 'cash' ? 'counter' : 'bank',
      amount:      -Math.abs(amount),
      entry_type:  'expense',
      source:      'manual',
      notes,
      created_by:  userId,
    })
    .select()
    .single();
  if (insertErr) throw error(500, insertErr.message);

  return json({ ok: true, entry: data });
}

function parseCategoryFromNotes(notes: string | null): string {
  if (!notes) return 'other';
  const m = notes.match(/^category:([a-z_]+)/);
  return m ? m[1] : 'other';
}
