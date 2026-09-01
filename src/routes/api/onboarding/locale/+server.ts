import { json } from '@sveltejs/kit';
import { userClient, userClientFromCtx } from '$lib/server/supabase';
import { localeSchema } from '$lib/validators/schemas';
import { parseBody } from '$lib/validators/parseBody';

/**
 * POST /api/onboarding/locale — save locale/currency/timezone settings.
 */
export async function POST({ cookies, request, locals  }: import('@sveltejs/kit').RequestEvent) {
  if (!locals.currentShop) return json({ error: 'No shop context' }, { status: 401 });

  const parsed = await parseBody(request, localeSchema);
  if (!parsed.ok) return parsed.response;

  const supabase = userClientFromCtx({ cookies } as any);
  const { error } = await supabase
    .from('shops')
    .update({ ...parsed.data, onboarding_step: 'appearance' })
    .eq('id', locals.currentShop.id);

  if (error) return json({ error: error.message }, { status: 400 });
  return json({ ok: true });
}