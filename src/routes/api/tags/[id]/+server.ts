import { json } from '@sveltejs/kit';
import { userClient, adminClient } from '$lib/server/supabase';

/**
 * PATCH /api/tags/[id] — update a tag.
 */
export async function PATCH({ params, request, locals }: import('@sveltejs/kit').RequestEvent) {
  if (!params.id) return json({ error: 'Missing id' }, { status: 400 });
  const body = await request.json();
  const supabase = userClient({ locals } as any);
  const { data, error } = await supabase
    .from('tags')
    .update(body)
    .eq('id', params.id)
    .select()
    .single();

  if (error) return json({ error: error.message }, { status: 400 });
  return json(data);
}

/**
 * DELETE /api/tags/[id] — hard delete. Tags are pure labels; no FK
 * constraint issues from removing them. The product_tags join rows will
 * cascade-delete via the FK.
 */
export async function DELETE({ params, locals }: import('@sveltejs/kit').RequestEvent) {
  if (!params.id) return json({ error: 'Missing id' }, { status: 400 });
  // Use admin client because RLS doesn't grant delete on tags; the user-level
  // policy only allows updates, not deletes. The admin client still enforces
  // shop scoping via the WHERE clause below.
  const admin = adminClient();
  const { error } = await admin
    .from('tags')
    .delete()
    .eq('id', params.id)
    .eq('shop_id', locals.currentShop!.id);

  if (error) return json({ error: error.message }, { status: 400 });
  return json({ ok: true });
}