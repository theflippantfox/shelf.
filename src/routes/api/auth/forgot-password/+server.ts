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
import { z } from 'zod';

const emailOnly = z.object({ email: z.string().trim().email() });

export async function POST({ request, cookies }: import('@sveltejs/kit').RequestEvent) {
  // Always return 200 to avoid leaking whether the account exists.
  let email: string | undefined;
  try {
    const body = await request.json();
    const r = emailOnly.safeParse(body);
    if (r.success) email = r.data.email;
  } catch { /* invalid JSON — fall through, no email */ }

  if (email) {
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
    }
  }

  return json({ ok: true });
}