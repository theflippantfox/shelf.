import { json } from '@sveltejs/kit';
import { userClient } from '$lib/server/supabase';

/**
 * GET /api/categories — list categories for the current shop.
 */
export async function GET({ locals }: import('@sveltejs/kit').RequestEvent) {
  if (!locals.currentShop) return json([]);
  const supabase = userClient({ locals } as any);
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .eq('shop_id', locals.currentShop.id)
    .is('archived_at', null)
    .order('sort_order')
    .order('name');

  if (error) return json({ error: error.message }, { status: 500 });
  return json(data ?? []);
}

/**
 * POST /api/categories — create a category.
 */
export async function POST({ request, locals }: import('@sveltejs/kit').RequestEvent) {
  if (!locals.currentShop) return json({ error: 'No shop' }, { status: 401 });
  const body = await request.json();
  const supabase = userClient({ locals } as any);
  const { data, error } = await supabase
    .from('categories')
    .insert({ ...body, shop_id: locals.currentShop.id })
    .select()
    .single();

  if (error) return json({ error: error.message }, { status: 400 });
  return json(data, { status: 201 });
}