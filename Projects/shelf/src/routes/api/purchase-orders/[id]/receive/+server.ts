import { json } from '@sveltejs/kit';
import { adminClient } from '$lib/server/directus';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request, locals }) => {
  const { id: poId } = params;
  const { shop_id } = locals.user;
  if (!shop_id) return json({ error: 'Shop ID missing' }, { status: 400 });

  try {
    const body = await request.json();
    const { received_date, items, notes } = body;

    // 1. Fetch the PO to verify ownership and current state
    const po = await adminClient().request({
      method: 'GET',
      url: `/items/purchase_orders/${poId}`,
      query: { fields: ['*'] }
    });

    if (!po || po.shop !== shop_id) {
      return json({ error: 'PO not found or unauthorized' }, { status: 404 });
    }

    // 2. Process each received item
    let totalSubtotal = 0;
    const stockUpdates = [];
    const priceHistoryRecords = [];

    for (const item of items) {
      const { id: poiId, quantity_received, unit_cost, update_cost_price } = item;

      // Update PO Item
      const lineTotal = quantity_received * unit_cost;
      totalSubtotal += lineTotal;

      await adminClient().request({
        method: 'PATCH',
        url: `/items/purchase_order_items/${poiId}`,
        body: {
          quantity_received,
          unit_cost,
          line_total: lineTotal
        }
      });

      // Find product to update qty and cost
      const poi = await adminClient().request({
        method: 'GET',
        url: `/items/purchase_order_items/${poiId}`,
        query: { fields: ['product'] }
      });

      if (poi.product) {
        const product = await adminClient().request({
          method: 'GET',
          url: `/items/products/${poi.product}`,
          query: { fields: ['qty', 'cost_price', 'expiry_tracking'] }
        });

        // Update Product Quantity
        const newQty = (product.qty || 0) + quantity_received;
        const productUpdate: any = { qty: newQty };
        if (update_cost_price) {
          productUpdate.cost_price = unit_cost;
        }

        await adminClient().request({
          method: 'PATCH',
          url: `/items/products/${poi.product}`,
          body: productUpdate
        });

        // Create Stock Log Entry
        await adminClient().request({
          method: 'POST',
          url: '/items/stock_log',
          body: {
            shop: shop_id,
            product: poi.product,
            delta: quantity_received,
            reason: 'restock',
            reference: po.order_ref,
            purchase_order: poId
          }
        });

        // Create Price History Record
        await adminClient().request({
          method: 'POST',
          url: '/items/supplier_price_history',
          body: {
            shop: shop_id,
            supplier: po.supplier,
            product: poi.product,
            unit_cost,
            purchase_order: poId,
            recorded_at: new Date().toISOString()
          }
        });

        // If expiry tracking is on, create a batch
        if (product.expiry_tracking) {
          // Note: batch details (expiry_date, batch_number) should be in 'items' array in request
          const batchDetails = items.find(i => i.id === poiId);
          if (batchDetails?.expiry_date) {
            await adminClient().request({
              method: 'POST',
              url: '/items/product_batches',
              body: {
                shop: shop_id,
                product: poi.product,
                purchase_order_item: poiId,
                expiry_date: batchDetails.expiry_date,
                batch_number: batchDetails.batch_number || null,
                quantity_remaining: quantity_received
              }
            });
          }
        }
      }
    }

    // 3. Update PO overall status and totals
    const allItems = await adminClient().request({
      method: 'GET',
      url: `/items/purchase_order_items`,
      query: {
        filter: { purchase_order: { _eq: poId } },
        fields: ['quantity_ordered', 'quantity_received']
      }
    });

    const isFull = allItems.every(i => i.quantity_received >= i.quantity_ordered);
    const isPartial = allItems.some(i => i.quantity_received > 0 && i.quantity_received < i.quantity_ordered);
    
    let finalStatus = 'received';
    if (isPartial) finalStatus = 'partial';
    if (!allItems.some(i => i.quantity_received > 0)) finalStatus = 'ordered';

    await adminClient().request({
      method: 'PATCH',
      url: `/items/purchase_orders/${poId}`,
      body: {
        status: finalStatus,
        received_date: received_date || new Date().toISOString().split('T')[0],
        subtotal: totalSubtotal,
        notes: notes || po.notes
      }
    });

    return json({ success: true, status: finalStatus });
  } catch (e) {
    console.error('Error receiving PO:', e);
    return json({ error: 'Failed to receive purchase order' }, { status: 500 });
  }
};
