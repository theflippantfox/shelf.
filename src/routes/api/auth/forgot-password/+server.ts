/**
 * POST /api/auth/forgot-password
 * Sends a password-reset email via Supabase Auth.
 * Always returns 200 (don't leak whether the account exists).
 */
import { json } from '@sveltejs/kit';
import { createServerClient } from '@supabase/ssr';
import {
  PUBLIC_SUPABASE_URL,
  PUBLIC_SUPABASE_ANON_KEY,
} from '$env/static/public';

export async function POST({ request, cookies }: import('@sveltejs/kit').RequestEvent) {
  const { email } = await request.json();
  if (!email) return json({ ok: true }); // never error on missing email

  try {
    const supabase = createServerClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
      cookies: {
        getAll: () => cookies.getAll(),
        setAll: () => { /* no-op — reset flow uses PKCE, not cookies here */ },
      },
    });

    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: 'http://127.0.0.1:5180/reset-password',
    });
  } catch (err) {
    console.error('[forgot-password]', err);
    // Still 200 — don't leak whether the account exists
  }

  return json({ ok: true });
}