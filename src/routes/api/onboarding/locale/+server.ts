import { json }     from '@sveltejs/kit';
import { adminClient, updateItem } from '$lib/server/directus';

export async function POST({ request, locals }) {
  if (!locals.currentShop) return json({ error: 'No shop context' }, { status: 401 });
  const body = await request.json();
  await adminClient().request(updateItem('shops', locals.currentShop.id, {
    ...body,
    onboarding_step: 'appearance',
  }));
  return json({ ok: true });
}
