import { json } from '@sveltejs/kit';
import { userClient, userClientFromCtx } from '$lib/server/supabase';

/**
 * POST /api/onboarding/locale — save locale/currency/timezone settings.
 */
export async function POST({ cookies, request, locals  }: import('@sveltejs/kit').RequestEvent) {
  if (!locals.currentShop) return json({ error: 'No shop context' }, { status: 401 });

  const body = await request.json();
  const supabase = userClientFromCtx({ cookies } as any);

  const { error } = await supabase
    .from('shops')
    .update({ ...body, onboarding_step: 'appearance' })
    .eq('id', locals.currentShop.id);

  if (error) return json({ error: error.message }, { status: 400 });
  return json({ ok: true });
}