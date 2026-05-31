/**
 * Directus SDK client factory.
 *
 * IMPORTANT: This module is for DATA operations only (read/write collections).
 * User authentication is handled by Shëlf's own sessions — see server/auth.ts.
 * The DIRECTUS_ADMIN_TOKEN here is a server-side service token, never exposed
 * to the browser or to Shëlf's end users.
 */
import {
  createDirectus,
  rest,
  staticToken,
  readItems,
  readItem,
  createItem,
  updateItem,
  deleteItem,
  type DirectusClient,
  type RestClient,
} from '@directus/sdk';
import { DIRECTUS_URL, DIRECTUS_ADMIN_TOKEN } from '$env/static/private';
import type { ShelfSchema } from '$lib/types/directus';

export type DirectusRestClient = DirectusClient<ShelfSchema> & RestClient<ShelfSchema>;

/** Admin client — used for all server-side data operations */
export function adminClient(): DirectusRestClient {
  return createDirectus<ShelfSchema>(DIRECTUS_URL)
    .with(staticToken(DIRECTUS_ADMIN_TOKEN))
    .with(rest()) as DirectusRestClient;
}

// Re-export SDK helpers so API routes import from one place
export { readItems, readItem, createItem, updateItem, deleteItem };
