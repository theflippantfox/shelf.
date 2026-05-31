import { json }     from '@sveltejs/kit';
import { adminClient, updateItem } from '$lib/server/directus';

export async function POST({ request, locals }) {
  if (!locals.currentShop) return json({ error: 'No shop context' }, { status: 401 });
  const { primary_color, sidebar_bg, theme } = await request.json();
  await adminClient().request(updateItem('shops', locals.currentShop.id, {
    primary_color,
    sidebar_bg,
    theme,
    onboarding_step: 'team',   // ← was 'categories', now correctly advances to team
  }));
  return json({ ok: true });
}
