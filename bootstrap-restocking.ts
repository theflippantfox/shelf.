import { adminClient } from '../src/lib/server/directus';

async function setupRestocking() {
  console.log('🚀 Starting Restocking Feature Schema Setup...');

  try {
    // 1. Suppliers Collection
    await adminClient().request('collections/create', {
      collection: 'suppliers',
      schema: {
        name: { type: 'string', required: true },
        contact_name: { type: 'string' },
        phone: { type: 'string' },
        email: { type: 'string' },
        address: { type: 'text' },
        payment_terms: { 
          type: 'string', 
          options: { 
            choices: ['cash', 'credit', 'net_15', 'net_30', 'net_60', 'consignment'] 
          } 
        },
        currency_code: { type: 'string', default: 'NGN' },
        lead_time_days: { type: 'integer' },
        notes: { type: 'text' },
        is_active: { type: 'boolean', default: true },
      }
    });
    console.log('✅ Created suppliers collection');

    // 2. Purchase Orders Collection
    await adminClient().request('collections/create', {
      collection: 'purchase_orders',
      schema: {
        shop: { type: 'uuid', required: true }, // FK to shops
        supplier: { type: 'uuid', required: true }, // FK to suppliers
        order_ref: { type: 'string', required: true },
        status: { 
          type: 'string', 
          options: { 
            choices: ['draft', 'ordered', 'partial', 'received', 'cancelled'] 
          },
          default: 'draft'
        },
        order_date: { type: 'date', required: true },
        expected_delivery_date: { type: 'date' },
        received_date: { type: 'date' },
        subtotal: { type: 'integer', default: 0 },
        tax_amount: { type: 'integer', default: 0 },
        shipping_cost: { type: 'integer', default: 0 },
        total_cost: { type: 'integer', default: 0 },
        bill_image: { type: 'uuid' },
        notes: { type: 'text' },
        created_by: { type: 'uuid' },
      }
    });
    console.log('✅ Created purchase_orders collection');

    // 3. Purchase Order Items
    await adminClient().request('collections/create', {
      collection: 'purchase_order_items',
      schema: {
        purchase_order: { type: 'uuid', required: true },
        product: { type: 'uuid' },
        product_name: { type: 'string', required: true },
        product_sku: { type: 'string' },
        quantity_ordered: { type: 'integer', required: true },
        quantity_received: { type: 'integer', default: 0 },
        unit_cost: { type: 'integer', required: true },
        line_total: { type: 'integer', default: 0 },
        is_new_product: { type: 'boolean', default: false },
        notes: { type: 'text' },
      }
    });
    console.log('✅ Created purchase_order_items collection');

    // 4. Supplier Price History
    await adminClient().request('collections/create', {
      collection: 'supplier_price_history',
      schema: {
        shop: { type: 'uuid', required: true },
        supplier: { type: 'uuid', required: true },
        product: { type: 'uuid', required: true },
        unit_cost: { type: 'integer', required: true },
        currency_code: { type: 'string', default: 'NGN' },
        purchase_order: { type: 'uuid' },
        recorded_at: { type: 'timestamp', default: 'now' },
        notes: { type: 'string' },
      }
    });
    console.log('✅ Created supplier_price_history collection');

    // 5. Product Batches (for expiry tracking)
    await adminClient().request('collections/create', {
      collection: 'product_batches',
      schema: {
        shop: { type: 'uuid', required: true },
        product: { type: 'uuid', required: true },
        purchase_order_item: { type: 'uuid' },
        batch_number: { type: 'string' },
        expiry_date: { type: 'date' },
        quantity_remaining: { type: 'integer', required: true },
        date_created: { type: 'timestamp', default: 'now' },
      }
    });
    console.log('✅ Created product_batches collection');

    // 6. Update existing products collection
    await adminClient().request('collections/update', {
      collection: 'products',
      schema: {
        reorder_point: { type: 'integer' },
        preferred_supplier: { type: 'uuid' },
      }
    });
    console.log('✅ Updated products collection');

    // 7. Update existing stock_log
    await adminClient().request('collections/update', {
      collection: 'stock_log',
      schema: {
        purchase_order: { type: 'uuid' },
      }
    });
    console.log('✅ Updated stock_log collection');

    console.log('🎉 Restocking schema successfully bootstrapped!');
  } catch (e) {
    console.error('❌ Error bootstrapping restocking schema:', e);
    process.exit(1);
  }
}

setupRestocking();
