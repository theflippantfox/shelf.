import { json } from '@sveltejs/kit';
import { userClient } from '$lib/server/supabase';

/**
 * PATCH /api/categories/[id] — update a category.
 */
export async function PATCH({ params, request, locals }: import('@sveltejs/kit').RequestEvent) {
  if (!params.id) return json({ error: 'Missing id' }, { status: 400 });
  const body = await request.json();
  const supabase = userClient({ locals } as any);
  const { data, error } = await supabase
    .from('categories')
    .update(body)
    .eq('id', params.id)
    .select()
    .single();

  if (error) return json({ error: error.message }, { status: 400 });
  return json(data);
}

/**
 * DELETE /api/categories/[id] — soft-delete by setting archived_at.
 */
export async function DELETE({ params, locals }: import('@sveltejs/kit').RequestEvent) {
  if (!params.id) return json({ error: 'Missing id' }, { status: 400 });
  const supabase = userClient({ locals } as any);
  const { data, error } = await supabase
    .from('categories')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', params.id)
    .select()
    .single();

  if (error) return json({ error: error.message }, { status: 400 });
  return json(data);
}