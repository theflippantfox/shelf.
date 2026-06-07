import { json } from '@sveltejs/kit';
import { adminClient, createItem, updateItem, readItems } from '$lib/server/directus';

async function retryRequest(fn, retries = 5) {
  try {
    return await fn();
  } catch (err) {
    if (err?.response?.status === 429 && retries > 0) {
      await new Promise((r) => setTimeout(r, 100));
      return retryRequest(fn, retries - 1);
    }
    throw err;
  }
}

export async function POST({ request, params, locals }) {
  if (!locals.currentShop) return json({ error: 'No shop' }, { status: 401 });

  const shopId = locals.currentShop.id;
  const body = await request.json();
  const client = adminClient();

  const { received_date, items, notes } = body;

  try {
    // Load purchase order once
    const poResult = await retryRequest(() =>
      client.request(
        readItems('purchase_orders', {
          filter: { id: { _eq: params.id } },
          limit: 1,
          fields: ['id', 'order_ref', 'supplier']
        })
      )
    );

    const purchaseOrder = poResult[0];

    // Load PO items once
    const itemIds = items.map((i) => i.id);

    const poItems = await retryRequest(() =>
      client.request(
        readItems('purchase_order_items', {
          filter: {
            id: { _in: itemIds }
          },
          limit: -1
        })
      )
    );

    const poItemMap = new Map(poItems.map((i) => [i.id, i]));

    // Load products once
    const productIds = poItems.map((i) => i.product).filter(Boolean);

    const products = await retryRequest(() =>
      client.request(
        readItems('products', {
          filter: {
            id: { _in: productIds }
          },
          limit: -1
        })
      )
    );

    const productMap = new Map(products.map((p) => [p.id, p]));

    for (const item of items) {
      const { id, quantity_received, unit_cost, update_cost_price } = item;

      const currentPoi = poItemMap.get(id);
      if (!currentPoi) continue;

      const lineTotal = quantity_received * unit_cost;

      await retryRequest(() =>
        client.request(
          updateItem('purchase_order_items', id, {
            quantity_received,
            unit_cost,
            line_total: lineTotal
          })
        )
      );

      if (!currentPoi.product) continue;

      const product = productMap.get(currentPoi.product);
      if (!product) continue;

      const productUpdate = {
        qty: product.qty + quantity_received,
        ...(update_cost_price ? { cost_price: unit_cost } : {})
      };

      await retryRequest(() =>
        client.request(updateItem('products', product.id, productUpdate))
      );

      await retryRequest(() =>
        client.request(
          createItem('stock_log', {
            shop: shopId,
            product: product.id,
            delta: quantity_received,
            reason: 'restock',
            reference: purchaseOrder.order_ref,
            purchase_order: params.id,
            created_by: locals.user?.id ?? null
          })
        )
      );

      await retryRequest(() =>
        client.request(
          createItem('supplier_price_history', {
            shop: shopId,
            supplier: purchaseOrder?.supplier ?? null,
            product: product.id,
            unit_cost,
            currency_code: locals.currentShop.currency_code,
            purchase_order: params.id,
            recorded_at: new Date().toISOString()
          })
        )
      );

      if (product.expiry_tracking) {
        await retryRequest(() =>
          client.request(
            createItem('product_batches', {
              shop: shopId,
              product: product.id,
              purchase_order_item: id,
              quantity_remaining: quantity_received,
              expiry_date: item.expiry_date || null,
              batch_number: item.batch_number || null
            })
          )
        );
      }
    }

    const allItems = await retryRequest(() =>
      client.request(
        readItems('purchase_order_items', {
          filter: { purchase_order: { _eq: params.id } },
          limit: -1
        })
      )
    );

    let subtotal = 0;
    let allReceived = true;
    let anyReceived = false;

    for (const item of allItems) {
      subtotal += item.quantity_received * item.unit_cost;

      if (item.quantity_received < item.quantity_ordered) allReceived = false;
      if (item.quantity_received > 0) anyReceived = true;
    }

    const status = allReceived
      ? 'received'
      : anyReceived
      ? 'partial'
      : 'ordered';

    await retryRequest(() =>
      client.request(
        updateItem('purchase_orders', params.id, {
          subtotal,
          total_cost:
            subtotal +
            (body.tax_amount || 0) +
            (body.shipping_cost || 0),
          status,
          received_date:
            received_date ||
            new Date().toISOString().split('T')[0],
          notes: notes || undefined
        })
      )
    );

    return json({ success: true }, { status: 200 });
  } catch (e) {
    console.error('Receive error:', e);

    if (e?.response?.status === 429) {
      return json(
        {
          error: 'Rate limited by Directus'
        },
        { status: 429 }
      );
    }

    return json(
      {
        error: 'Internal Server Error',
        details: e?.message
      },
      { status: 500 }
    );
  }
}

