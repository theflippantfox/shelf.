import { json } from '@sveltejs/kit';
import { adminClient, updateItem, deleteItem } from '$lib/server/directus';

export async function PATCH({ params, request }) {
  const body = await request.json();
  const tag  = await adminClient().request(updateItem('tags', params.id, body));
  return json(tag);
}

export async function DELETE({ params }) {
  await adminClient().request(deleteItem('tags', params.id));
  return json({ ok: true });
}
