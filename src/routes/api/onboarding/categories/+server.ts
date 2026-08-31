import { json } from '@sveltejs/kit';
import { userClient, userClientFromCtx } from '$lib/server/supabase';

/**
 * POST /api/onboarding/categories — bulk-create starter categories.
 * Marks the shop as onboarding_complete when done.
 */
export async function POST({ cookies, request, locals  }: import('@sveltejs/kit').RequestEvent) {
  if (!locals.currentShop) return json({ error: 'No shop context' }, { status: 401 });

  const { categories } = await request.json();
  const supabase = userClientFromCtx({ cookies } as any);

  if (categories?.length) {
    const rows = categories.map((c: any, i: number) => ({
      ...c,
      shop_id: locals.currentShop!.id,
      sort_order: i,
    }));
    const { error } = await supabase.from('categories').insert(rows);
    if (error) return json({ error: error.message }, { status: 400 });
  }

  const { error: shopErr } = await supabase
    .from('shops')
    .update({ onboarding_complete: true, onboarding_step: 'complete' })
    .eq('id', locals.currentShop.id);

  if (shopErr) return json({ error: shopErr.message }, { status: 400 });
  return json({ ok: true });
}