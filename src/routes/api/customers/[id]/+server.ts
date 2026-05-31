import { json } from '@sveltejs/kit';
import { adminClient, readItem, updateItem, deleteItem } from '$lib/server/directus';

export async function GET({ params }) {
  const client   = adminClient();
  const customer = await client.request(readItem('customers', params.id));
  return json(customer);
}

export async function PATCH({ params, request }) {
  const body     = await request.json();
  const client   = adminClient();
  const customer = await client.request(updateItem('customers', params.id, body));
  return json(customer);
}

export async function DELETE({ params }) {
  const client = adminClient();
  await client.request(deleteItem('customers', params.id));
  return json({ ok: true });
}
