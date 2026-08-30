import { json } from '@sveltejs/kit';
import { adminClient, readItems, createItem } from '$lib/server/directus';

/**
 * Generate a unique SKU for a product.
 * Format: SKU-YYYY-XXXX where XXXX is a random alphanumeric string
 */
async function generateUniqueSKU(shopId: string): Promise<string> {
  const client = adminClient();
  const year = new Date().getFullYear();
  
  // Generate random 4-character alphanumeric string
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Excluding confusing chars
  let attempts = 0;
  const maxAttempts = 10;
  
  while (attempts < maxAttempts) {
    let randomStr = '';
    for (let i = 0; i < 4; i++) {
      randomStr += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
    const sku = `SKU-${year}-${randomStr}`;
    
    // Check if SKU already exists in this shop
    const existing = await client.request(readItems('products', {
      filter: {
        shop: { _eq: shopId },
        sku: { _eq: sku },
      },
      limit: 1,
    }));
    
    if (existing.length === 0) {
      return sku;
    }
    
    attempts++;
  }
  
  // Fallback with timestamp if all attempts fail
  return `SKU-${year}-${Date.now().toString(36).toUpperCase().slice(-4)}`;
}

export async function GET({ locals, url }) {
  if (!locals.currentShop) return json({ error: 'No shop' }, { status: 401 });
  const shopId = locals.currentShop.id;
  const search = url.searchParams.get('search') ?? '';
  const cat    = url.searchParams.get('category') ?? '';
  const alert  = url.searchParams.get('alert');

  const filter: Record<string, unknown> = {
    shop: { _eq: shopId },
    archived_at: { _null: true },
  };
  if (cat) filter['category'] = { _eq: cat };
  if (search) filter['_or'] = [
    { name: { _icontains: search } },
    { sku:  { _icontains: search } },
  ];

  const client = adminClient();
  let products = await client.request(readItems('products', {
    filter,
    fields: ['*', 'category.id', 'category.name', 'category.color', 'category.icon'],
    sort:   ['name'],
    limit:  -1,
  }));

  if (alert === 'true') {
    products = products.filter((p: any) =>
      p.qty === 0 || p.qty <= (p.low_stock_threshold ?? locals.currentShop!.low_stock_threshold ?? 10)
    );
  }

  return json(products);
}

export async function POST({ request, locals }) {
  if (!locals.currentShop) return json({ error: 'No shop' }, { status: 401 });
  const body = await request.json();
  const client = adminClient();

  // Auto-generate SKU if not provided
  let sku = body.sku?.trim();
  if (!sku) {
    sku = await generateUniqueSKU(locals.currentShop.id);
  }

  const product = await client.request(createItem('products', {
    ...body,
    sku,
    shop: locals.currentShop.id,
  }));
  return json(product, { status: 201 });
}
