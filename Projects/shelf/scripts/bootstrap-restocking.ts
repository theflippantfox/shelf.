import { createDirectusClient } from '@directus/sdk';
import { staticTokenClient } from '@directus/sdk/auth';
import * as dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env.production
dotenv.config({ path: path.resolve(process.cwd(), '.env.production') });

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_ADMIN_TOKEN = process.env.DIRECTUS_ADMIN_TOKEN;

if (!DIRECTUS_URL || !DIRECTUS_ADMIN_TOKEN) {
  console.error('❌ Missing DIRECTUS_URL or DIRECTUS_ADMIN_TOKEN in .env.production');
  process.exit(1);
}

const client = createDirectusClient(DIRECTUS_URL).with(staticTokenClient(DIRECTUS_ADMIN_TOKEN));

async function setupRestocking() {
  console.log('🚀 Starting Restocking Feature Schema Setup...');

  try {
    // 1. Suppliers Collection
    await client.request(createCollection('suppliers', {
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
    }));
    console.log('✅ Created suppliers collection');

    // 2. Purchase Orders Collection
    await client.request(createCollection('purchase_orders', {
      schema: {
        shop: { type: 'uuid', required: true },
        supplier: { type: 'uuid', required: true },
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
    }));
    console.log('✅ Created purchase_orders collection');

    // 3. Purchase Order Items
    await client.request(createCollection('purchase_order_items', {
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
    }));
    console.log('✅ Created purchase_order_items collection');

    // 4. Supplier Price History
    await client.request(createCollection('supplier_price_history', {
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
    }));
    console.log('✅ Created supplier_price_history collection');

    // 5. Product Batches
    await client.request(createCollection('product_batches', {
      schema: {
        shop: { type: 'uuid', required: true },
        product: { type: 'uuid', required: true },
        purchase_order_item: { type: 'uuid' },
        batch_number: { type: 'string' },
        expiry_date: { type: 'date' },
        quantity_remaining: { type: 'integer', required: true },
        date_created: { type: 'timestamp', default: 'now' },
      }
    }));
    console.log('✅ Created product_batches collection');

    // 6. Update existing products collection
    await client.request(updateCollection('products', {
      schema: {
        reorder_point: { type: 'integer' },
        preferred_supplier: { type: 'uuid' },
      }
    }));
    console.log('✅ Updated products collection');

    // 7. Update existing stock_log
    await client.request(updateCollection('stock_log', {
      schema: {
        purchase_order: { type: 'uuid' },
      }
    }));
    console.log('✅ Updated stock_log collection');

    console.log('🎉 Restocking schema successfully bootstrapped!');
  } catch (e) {
    console.error('❌ Error bootstrapping restocking schema:', e);
    process.exit(1);
  }
}

// Helper functions to match Directus API expectations
function createCollection(name: string, body: any) {
  return (client: any) => client.request(createCollectionRequest(name, body));
}

function updateCollection(name: string, body: any) {
  return (client: any) => client.request(updateCollectionRequest(name, body));
}

function createCollectionRequest(name: string, body: any) {
  return {
    method: 'POST',
    url: `/collections`,
    body: {
      collection: name,
      schema: body.schema,
    },
  };
}

function updateCollectionRequest(name: string, body: any) {
  return {
    method: 'PATCH',
    url: `/collections/${name}`,
    body: {
      schema: body.schema,
    },
  };
}

setupRestocking();
