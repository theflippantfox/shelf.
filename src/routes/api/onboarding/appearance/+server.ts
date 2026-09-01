import { json } from '@sveltejs/kit';
import { userClientFromCtx } from '$lib/server/supabase';
import { appearanceSchema } from '$lib/validators/schemas';
import { parseBody } from '$lib/validators/parseBody';

/**
 * POST /api/onboarding/appearance — save theme/colors.
 * Advances to the 'team' step.
 */
export async function POST({ cookies, request, locals  }: import('@sveltejs/kit').RequestEvent) {
  if (!locals.currentShop) return json({ error: 'No shop context' }, { status: 401 });

  const parsed = await parseBody(request, appearanceSchema);
  if (!parsed.ok) return parsed.response;
  const { primary_color, sidebar_bg, theme, palette_id } = parsed.data;
  const supabase = userClientFromCtx({ cookies } as any);

  const update: Record<string, unknown> = {
    primary_color,
    sidebar_bg,
    theme,
    onboarding_step: 'team',
  };
  if (palette_id) update.palette_id = palette_id;

  const { error } = await supabase
    .from('shops')
    .update(update as any)
    .eq('id', locals.currentShop.id);

  if (error) return json({ error: error.message }, { status: 400 });
  return json({ ok: true });
}