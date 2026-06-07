import { json, error } from '@sveltejs/kit';
import { adminClient, readItem, readItems, updateItem } from '$lib/server/directus';

export async function GET({ params, locals }) {
  if (!locals.currentShop) return json({ error: 'No shop' }, { status: 401 });

  const client = adminClient();
  try {
    const [order, items] = await Promise.all([
      client.request(readItem('purchase_orders', params.id, {
        fields: [
          'id', 'order_ref', 'status', 'order_date', 'expected_delivery_date',
          'received_date', 'subtotal', 'tax_amount', 'shipping_cost', 'total_cost',
          'bill_image', 'notes', 'date_created',
          'supplier.id', 'supplier.name', 'supplier.contact_name', 'supplier.phone',
          'created_by.first_name', 'created_by.last_name',
        ],
      })),
      client.request(readItems('purchase_order_items', {
        filter: { purchase_order: { _eq: params.id } },
        fields: [
          'id', 'product', 'product_name', 'product_sku',
          'quantity_ordered', 'quantity_received',
          'unit_cost', 'line_total', 'is_new_product', 'notes',
        ],
        sort:  ['id'],
        limit: -1,
      })),
    ]);

    return json({ ...order as object, items });
  } catch {
    throw error(404, 'Purchase order not found');
  }
}

export async function PATCH({ params, request, locals }) {
  if (!locals.currentShop) return json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json();

  const ALLOWED = [
    'status', 'expected_delivery_date', 'received_date',
    'notes', 'bill_image', 'order_ref',
    'tax_amount', 'shipping_cost', 'total_cost',
  ];
  const safe: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (ALLOWED.includes(k)) safe[k] = v;
  }

  if ('tax_amount' in safe || 'shipping_cost' in safe) {
    const current = await adminClient().request(readItem('purchase_orders', params.id, {
      fields: ['subtotal', 'tax_amount', 'shipping_cost'],
    })) as any;
    safe['total_cost'] =
      (current.subtotal      ?? 0) +
      Number(safe['tax_amount']    ?? current.tax_amount    ?? 0) +
      Number(safe['shipping_cost'] ?? current.shipping_cost ?? 0);
  }

  const order = await adminClient().request(updateItem('purchase_orders', params.id, safe));
  return json(order);
}

export async function DELETE({ params, locals }) {
  if (!locals.currentShop) return json({ error: 'Unauthorized' }, { status: 401 });

  const order = await adminClient().request(readItem('purchase_orders', params.id, {
    fields: ['status'],
  })) as any;

  if (!['draft', 'ordered'].includes(order.status)) {
    return json({ error: 'Only draft or ordered POs can be cancelled' }, { status: 400 });
  }

  await adminClient().request(updateItem('purchase_orders', params.id, { status: 'cancelled' }));
  return json({ ok: true });
}
