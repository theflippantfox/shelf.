import { json, type RequestEvent } from '@sveltejs/kit';
import { adminClient, readItems, createItem } from '$lib/server/directus';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function genRef() {
  const d    = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `PO-${d}-${rand}`;
}

export async function GET({ locals, url }) {
  if (!locals.currentShop) return json({ error: 'No shop' }, { status: 401 });

  const status   = url.searchParams.get('status')   ?? '';
  const supplier = url.searchParams.get('supplier') ?? '';
  const page     = Math.max(1, parseInt(url.searchParams.get('page') ?? '1'));

  const filter: Record<string, unknown> = { shop: { _eq: locals.currentShop.id } };
  if (status)   filter['status']   = { _eq: status };
  if (supplier) filter['supplier'] = { _eq: supplier };

  const orders = await adminClient().request(readItems('purchase_orders', {
    filter,
    fields: [
      'id', 'order_ref', 'status', 'order_date', 'expected_delivery_date',
      'received_date', 'subtotal', 'tax_amount', 'shipping_cost', 'total_cost',
      'notes', 'date_created',
      'supplier.id', 'supplier.name',
      'created_by.first_name', 'created_by.last_name',
    ],
    sort:  ['-date_created'],
    page,
    limit: 50,
  }));

  return json(orders);
}

export async function POST({ request, locals }: RequestEvent) {
  if (!locals.currentShop || !locals.user) {
    return json({ error: 'Invalid' }, { status: 401 });
  }

  const body = await request.json();

  // ── Validate supplier ──────────────────────────────────────────────────────
  if (!body.supplier) return json({ error: 'supplier is required' }, { status: 400 });
  const supplierStr = String(body.supplier).trim();

  if (!UUID_RE.test(supplierStr)) {
    return json(
      { error: `Invalid supplier value "${supplierStr}". Select a supplier from the dropdown — it must be a valid UUID.` },
      { status: 400 }
    );
  }

  if (!body.order_date) return json({ error: 'order_date is required' }, { status: 400 });

  // ── Coerce monetary values to integers (minor units) ───────────────────────
  const subtotal     = Math.round(Number(body.subtotal      ?? 0));
  const taxAmount    = Math.round(Number(body.tax_amount    ?? 0));
  const shippingCost = Math.round(Number(body.shipping_cost ?? 0));
  const totalCost    = subtotal + taxAmount + shippingCost;

  const order = await adminClient().request(createItem('purchase_orders', {
    shop:                   locals.currentShop.id,
    supplier:               supplierStr,
    order_ref:              body.order_ref?.trim() || genRef(),
    status:                 body.status ?? 'draft',
    order_date:             body.order_date,
    expected_delivery_date: body.expected_delivery_date || null,
    subtotal,
    tax_amount:             taxAmount,
    shipping_cost:          shippingCost,
    total_cost:             totalCost,
    notes:                  body.notes || null,
    created_by:             locals.user.id,
  }));

  return json(order, { status: 201 });
}
