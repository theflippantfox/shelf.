/**
 * Browser-side Supabase client using cookie-based auth.
 * Used exclusively for Realtime subscriptions — all other
 * browser fetches go through the API routes + offlineFetch.
 */
import { createBrowserClient } from "@supabase/ssr";
import {
 PUBLIC_SUPABASE_URL,
 PUBLIC_SUPABASE_ANON_KEY,
} from "$env/static/public";
import type { Database } from "$lib/types/db";

let _client: ReturnType<typeof createBrowserClient<Database>> | null = null;

/**
 * Singleton browser Supabase client. Safe to call multiple times.
 * The cookie-based session is automatically managed by @supabase/ssr.
 */
export function getBrowserSupabase() {
 if (_client) return _client;
 _client = createBrowserClient<Database>(
  PUBLIC_SUPABASE_URL,
  PUBLIC_SUPABASE_ANON_KEY,
 );
 return _client;
}
