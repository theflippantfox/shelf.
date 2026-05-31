import { json }     from '@sveltejs/kit';
import { adminClient, createItem, updateItem } from '$lib/server/directus';
import { DIRECTUS_URL, DIRECTUS_ADMIN_TOKEN } from '$env/static/private';

export async function POST({ request, locals }) {
  if (!locals.currentShop || !locals.user)
    return json({ error: 'No shop context' }, { status: 401 });

  const { invites } = await request.json() as {
    invites: { first_name: string; email: string; password: string; role: string }[]
  };

  const client   = adminClient();
  const failures: string[] = [];

  for (const invite of (invites ?? [])) {
    if (!invite.email || !invite.password) continue;
    try {
      // Create the Directus user account
      const userRes = await fetch(`${DIRECTUS_URL}/users`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${DIRECTUS_ADMIN_TOKEN}` },
        body:    JSON.stringify({
          first_name: invite.first_name,
          email:      invite.email,
          password:   invite.password,
        }),
      });

      if (!userRes.ok) {
        const err = await userRes.json().catch(() => ({}));
        failures.push(`${invite.email}: ${err?.errors?.[0]?.message ?? 'failed'}`);
        continue;
      }

      const { data: newUser } = await userRes.json();

      // Link them to the shop
      await client.request(createItem('shop_members', {
        shop:   locals.currentShop!.id,
        user:   newUser.id,
        role:   invite.role ?? 'cashier',
        status: 'active',
      }));
    } catch (err) {
      failures.push(`${invite.email}: unexpected error`);
    }
  }

  // Advance onboarding step regardless of partial failures
  await client.request(updateItem('shops', locals.currentShop.id, {
    onboarding_step: 'categories',
  }));

  if (failures.length > 0) {
    return json({ ok: true, warnings: failures });
  }
  return json({ ok: true });
}
