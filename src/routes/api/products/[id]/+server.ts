import { json } from '@sveltejs/kit';
import { userClient, userClientFromCtx } from '$lib/server/supabase';

/**
 * GET /api/products/[id] — single product with category join.
 */
export async function GET({ cookies, params, locals  }: import('@sveltejs/kit').RequestEvent) {
  if (!params.id) return json({ error: 'Missing id' }, { status: 400 });
  const supabase = userClientFromCtx({ cookies } as any);
  const { data, error } = await supabase
    .from('products')
    .select('*, category:categories(*)')
    .eq('id', params.id)
    .single();

  if (error) return json({ error: error.message }, { status: 404 });
  return json(data);
}

/**
 * PATCH /api/products/[id] — update product fields.
 */
export async function PATCH({ cookies, params, request, locals  }: import('@sveltejs/kit').RequestEvent) {
  if (!params.id) return json({ error: 'Missing id' }, { status: 400 });
  const body = await request.json();
  const supabase = userClientFromCtx({ cookies } as any);
  const { data, error } = await supabase
    .from('products')
    .update(body)
    .eq('id', params.id)
    .select()
    .single();

  if (error) return json({ error: error.message }, { status: 400 });
  return json(data);
}

/**
 * DELETE /api/products/[id] — soft-delete by setting archived_at.
 */
export async function DELETE({ cookies, params, locals  }: import('@sveltejs/kit').RequestEvent) {
  if (!params.id) return json({ error: 'Missing id' }, { status: 400 });
  const supabase = userClientFromCtx({ cookies } as any);
  const { data, error } = await supabase
    .from('products')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', params.id)
    .select()
    .single();

  if (error) return json({ error: error.message }, { status: 400 });
  return json(data);
}