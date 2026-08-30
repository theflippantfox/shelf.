import { json } from '@sveltejs/kit';
import { userClient } from '$lib/server/supabase';

/**
 * /api/suppliers — list (active, with search filter) and create.
 */
export async function GET({ locals, url }: import('@sveltejs/kit').RequestEvent) {
  if (!locals.currentShop) return json({ error: 'No shop' }, { status: 401 });
  const search = url.searchParams.get('search') ?? '';

  const supabase = userClient({ locals } as any);
  let q = supabase
    .from('suppliers')
    .select('*')
    .eq('shop_id', locals.currentShop.id)
    .eq('is_active', true)
    .order('name');

  if (search) q = q.ilike('name', `%${search}%`);

  const { data, error } = await q;
  if (error) return json({ error: error.message }, { status: 500 });
  return json(data ?? []);
}

/**
 * POST /api/suppliers — create a supplier.
 */
export async function POST({ request, locals }: import('@sveltejs/kit').RequestEvent) {
  if (!locals.currentShop) return json({ error: 'No shop' }, { status: 401 });
  const body = await request.json();
  const supabase = userClient({ locals } as any);

  const { data, error } = await supabase
    .from('suppliers')
    .insert({ ...body, shop_id: locals.currentShop.id })
    .select()
    .single();

  if (error) return json({ error: error.message }, { status: 400 });
  return json(data, { status: 201 });
}