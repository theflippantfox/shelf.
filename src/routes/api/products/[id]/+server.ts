import { json } from '@sveltejs/kit';
import { adminClient, readItem, updateItem, deleteItem } from '$lib/server/directus';

export async function GET({ params }) {
  const client  = adminClient();
  const product = await client.request(readItem('products', params.id, {
    fields: ['*', 'category.*'],
  }));
  return json(product);
}

export async function PATCH({ params, request }) {
  const body    = await request.json();
  const client  = adminClient();
  const product = await client.request(updateItem('products', params.id, body));
  return json(product);
}

export async function DELETE({ params }) {
  const client = adminClient();
  // soft-delete: set archived_at
  const product = await client.request(updateItem('products', params.id, {
    archived_at: new Date().toISOString(),
  }));
  return json(product);
}
