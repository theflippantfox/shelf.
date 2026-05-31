import { json } from '@sveltejs/kit';
import { adminClient, readItem, updateItem, createItem } from '$lib/server/directus';

export async function POST({ request, locals }) {
  if (!locals.currentShop || !locals.user)
    return json({ error: 'No shop' }, { status: 401 });

  const { product_id, delta, reason, reference } = await request.json();
  if (!product_id || !delta || !reason)
    return json({ error: 'product_id, delta, reason required' }, { status: 400 });

  const client  = adminClient();
  const product = await client.request(readItem('products', product_id, { fields: ['id','qty'] }));
  const newQty  = Math.max(0, (product as any).qty + delta);

  await client.request(updateItem('products', product_id, { qty: newQty }));
  await client.request(createItem('stock_log', {
    shop:       locals.currentShop.id,
    product:    product_id,
    delta,
    reason,
    reference:  reference ?? null,
    created_by: locals.user.id,
  }));

  return json({ ok: true, qty: newQty });
}
