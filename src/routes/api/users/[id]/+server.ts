import { json }     from '@sveltejs/kit';
import { adminClient, updateItem } from '$lib/server/directus';

export async function PATCH({ params, request, locals }) {
  if (locals.shopMember?.role !== 'owner')
    return json({ error: 'Forbidden' }, { status: 403 });
  const body   = await request.json();
  // Only allow updating role/status/permissions on the shop_member row
  const safe   = Object.fromEntries(
    Object.entries(body).filter(([k]) => ['role', 'status', 'permissions'].includes(k))
  );
  const member = await adminClient().request(updateItem('shop_members', params.id, safe));
  return json(member);
}

export async function DELETE({ params, locals }) {
  if (locals.shopMember?.role !== 'owner')
    return json({ error: 'Forbidden' }, { status: 403 });
  await adminClient().request(updateItem('shop_members', params.id, { status: 'suspended' }));
  return json({ ok: true });
}
