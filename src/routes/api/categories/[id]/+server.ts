import { json } from '@sveltejs/kit';
import { adminClient, updateItem } from '$lib/server/directus';

export async function PATCH({ params, request }) {
  const body   = await request.json();
  const client = adminClient();
  const cat    = await client.request(updateItem('categories', params.id, body));
  return json(cat);
}

export async function DELETE({ params }) {
  const client = adminClient();
  await client.request(updateItem('categories', params.id, { archived_at: new Date().toISOString() }));
  return json({ ok: true });
}
