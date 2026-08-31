import { json } from '@sveltejs/kit';
import { userClient, userClientFromCtx } from '$lib/server/supabase';

/**
 * POST /api/onboarding/appearance — save theme/colors.
 * Advances to the 'team' step.
 */
export async function POST({ cookies, request, locals  }: import('@sveltejs/kit').RequestEvent) {
  if (!locals.currentShop) return json({ error: 'No shop context' }, { status: 401 });

  const { primary_color, sidebar_bg, theme } = await request.json();
  const supabase = userClientFromCtx({ cookies } as any);

  const { error } = await supabase
    .from('shops')
    .update({ primary_color, sidebar_bg, theme, onboarding_step: 'team' })
    .eq('id', locals.currentShop.id);

  if (error) return json({ error: error.message }, { status: 400 });
  return json({ ok: true });
}