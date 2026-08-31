import { json } from '@sveltejs/kit';
import { userClient, userClientFromCtx } from '$lib/server/supabase';

/**
 * PATCH /api/suppliers/[id] — update a supplier.
 */
export async function PATCH({ cookies, params, request, locals  }: import('@sveltejs/kit').RequestEvent) {
  if (!params.id) return json({ error: 'Missing id' }, { status: 400 });
  const body = await request.json();
  const supabase = userClientFromCtx({ cookies } as any);
  const { data, error } = await supabase
    .from('suppliers')
    .update(body)
    .eq('id', params.id)
    .select()
    .single();

  if (error) return json({ error: error.message }, { status: 400 });
  return json(data);
}

/**
 * DELETE /api/suppliers/[id] — soft delete (set is_active = false).
 */
export async function DELETE({ cookies, params, locals  }: import('@sveltejs/kit').RequestEvent) {
  if (!params.id) return json({ error: 'Missing id' }, { status: 400 });
  const supabase = userClientFromCtx({ cookies } as any);
  const { data, error } = await supabase
    .from('suppliers')
    .update({ is_active: false })
    .eq('id', params.id)
    .select()
    .single();

  if (error) return json({ error: error.message }, { status: 400 });
  return json(data);
}