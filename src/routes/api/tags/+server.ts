import { json } from '@sveltejs/kit';
import { userClient, userClientFromCtx } from '$lib/server/supabase';

/**
 * GET /api/tags — list tags for the current shop.
 */
export async function GET({ cookies, locals  }: import('@sveltejs/kit').RequestEvent) {
  if (!locals.currentShop) return json([]);
  const supabase = userClientFromCtx({ cookies } as any);
  const { data, error } = await supabase
    .from('tags')
    .select('*')
    .eq('shop_id', locals.currentShop.id)
    .order('name');

  if (error) return json({ error: error.message }, { status: 500 });
  return json(data ?? []);
}

/**
 * POST /api/tags — create a tag.
 */
export async function POST({ cookies, request, locals  }: import('@sveltejs/kit').RequestEvent) {
  if (!locals.currentShop) return json({ error: 'No shop' }, { status: 401 });
  const body = await request.json();
  const supabase = userClientFromCtx({ cookies } as any);
  const { data, error } = await supabase
    .from('tags')
    .insert({ ...body, shop_id: locals.currentShop.id })
    .select()
    .single();

  if (error) return json({ error: error.message }, { status: 400 });
  return json(data, { status: 201 });
}