import { json } from '@sveltejs/kit';
import { adminClient, createItem, updateItem, readItems } from '$lib/server/directus';

export async function POST({ request, params, locals }) {
  if (!locals.currentShop) return json({ error: 'No shop' }, { status: 401 });
  const shopId = locals.currentShop.id;
  const body = await request.json();
  const client = adminClient();

  const { received_date, items, notes } = body;

  try {
    // In a real production environment with a DB supporting transactions, 
    // we would wrap all of this in a single transaction.
    // Directus API doesn't support arbitrary multi-collection transactions 
    // via REST in a single call, so we implement the logic sequentially.
    
    const results = [];
    for (const item of items) {
      const { id, quantity_received, unit_cost, update_cost_price } = item;
      
      // 1. Update PO Item
      const poi = await client.request(readItems('purchase_order_items', {
        filter: { id: { _eq: id } },
        limit: 1,
      }));
      const currentPoi = poi[0];
      const lineTotal = quantity_received * unit_cost;
      
      await client.request(updateItem('purchase_order_items', id, {
        quantity_received,
        unit_cost,
        line_total: lineTotal,
      }));

      // 2. Update Product Quantity
      if (currentPoi.product) {
        const product = await client.request(readItems('products', {
          filter: { id: { _eq: currentPoi.product } },
          limit: 1,
        }));
        const p = product[0];
        
        await client.request(updateItem('products', p.id, {
          qty: p.qty + quantity_received,
        }));

        // 3. Update Product Cost Price if requested
        if (update_cost_price) {
          await client.request(updateItem('products', p.id, {
            cost_price: unit_cost,
          }));
        }

        // 4. Create Stock Log entry
        const po = await client.request(readItems('purchase_orders', {
          filter: { id: { _eq: params.id } },
          limit: 1,
        }));
        
        await client.request(createItem('stock_log', {
          shop: shopId,
          product: p.id,
          delta: quantity_received,
          reason: 'restock',
          reference: po[0].order_ref,
          purchase_order: params.id,
          created_by: locals.user?.id ?? null,
        }));

      // 5. Create Supplier Price History
      const poForPrice = await client.request(readItems('purchase_orders', {
        filter: { id: { _eq: params.id } },
        limit: 1,
        fields: ['supplier'],
      }));

      await client.request(createItem('supplier_price_history', {
        shop: shopId,
        supplier: poForPrice[0]?.supplier ?? currentPoi.supplier ?? null,
        product: p.id,
        unit_cost: unit_cost,
        currency_code: locals.currentShop.currency_code,
        purchase_order: params.id,
        recorded_at: new Date().toISOString(),
      }));

        // 6. Create Product Batch if expiry tracking is enabled
        if (p.expiry_tracking) {
          await client.request(createItem('product_batches', {
            shop: shopId,
            product: p.id,
            purchase_order_item: id,
            quantity_remaining: quantity_received,
            // expiry_date and batch_number should be passed in the item body
            expiry_date: item.expiry_date || null,
            batch_number: item.batch_number || null,
          }));
        }
      }
      results.push({ id, status: 'received' });
    }

    // 7. Recalculate PO Totals & Status
    const allItems = await client.request(readItems('purchase_order_items', {
      filter: { purchase_order: { _eq: params.id } },
      limit: -1,
    }));
    
    let subtotal = 0;
    let allReceived = true;
    let anyReceived = false;

    for (const item of allItems) {
      subtotal += (item.quantity_received * item.unit_cost);
      if (item.quantity_received < item.quantity_ordered) allReceived = false;
      if (item.quantity_received > 0) anyReceived = true;
    }

    const status = allReceived ? 'received' : (anyReceived ? 'partial' : 'ordered');
    
    await client.request(updateItem('purchase_orders', params.id, {
      subtotal,
      total_cost: subtotal + (body.tax_amount || 0) + (body.shipping_cost || 0),
      status,
      received_date: received_date || new Date().toISOString().split('T')[0],
      notes: notes || undefined,
    }));

    return json({ success: true }, { status: 200 });

  } catch (e) {
    console.error('Receive error:', e);
    return json({ error: 'Internal Server Error', details: e.message }, { status: 500 });
  }
}
