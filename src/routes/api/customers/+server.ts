import { json } from '@sveltejs/kit';
import { userClient } from '$lib/server/supabase';

/**
 * GET /api/customers — list for current shop, with optional search.
 * POST /api/customers — create a customer.
 */
export async function GET({ locals, url }: import('@sveltejs/kit').RequestEvent) {
  if (!locals.currentShop) return json({ error: 'No shop' }, { status: 401 });
  const search = url.searchParams.get('search') ?? '';
  const supabase = userClient({ locals } as any);

  let q = supabase
    .from('customers')
    .select('*')
    .eq('shop_id', locals.currentShop.id)
    .order('name');

  if (search) {
    q = q.or(`name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`);
  }

  const { data, error } = await q;
  if (error) return json({ error: error.message }, { status: 500 });
  return json(data ?? []);
}

export async function POST({ request, locals }: import('@sveltejs/kit').RequestEvent) {
  if (!locals.currentShop) return json({ error: 'No shop' }, { status: 401 });
  const body = await request.json();
  const supabase = userClient({ locals } as any);

  const { data, error } = await supabase
    .from('customers')
    .insert({ ...body, shop_id: locals.currentShop.id })
    .select()
    .single();

  if (error) return json({ error: error.message }, { status: 400 });
  return json(data, { status: 201 });
}