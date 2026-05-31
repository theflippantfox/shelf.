import { json }     from '@sveltejs/kit';
import { adminClient, createItem, updateItem } from '$lib/server/directus';

export async function POST({ request, locals }) {
  if (!locals.currentShop) return json({ error: 'No shop context' }, { status: 401 });
  const { categories } = await request.json();
  const client = adminClient();

  for (let i = 0; i < (categories ?? []).length; i++) {
    await client.request(createItem('categories', {
      ...categories[i],
      shop:       locals.currentShop.id,
      sort_order: i,
    }));
  }

  // Mark onboarding complete — this is what the layout guard checks
  await client.request(updateItem('shops', locals.currentShop.id, {
    onboarding_complete: true,
    onboarding_step:     'complete',
  }));
  return json({ ok: true });
}
