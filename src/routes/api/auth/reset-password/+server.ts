/**
 * POST /api/auth/reset-password
 * Used after the user clicks the reset link in their email.
 * Supabase handles the token exchange; we just need to update the password.
 */
import { json } from '@sveltejs/kit';
import { createServerClient } from '@supabase/ssr';
import {
  PUBLIC_SUPABASE_URL,
  PUBLIC_SUPABASE_ANON_KEY,
} from '$env/static/public';

const COOKIE_OPTS = {
  path: '/',
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: false,
  maxAge: 60 * 60 * 24 * 30,
};

export async function POST({ request, cookies }: import('@sveltejs/kit').RequestEvent) {
  const { password } = await request.json();
  if (!password || password.length < 8) {
    return json({ error: 'Password must be at least 8 characters' }, { status: 400 });
  }

  try {
    const supabase = createServerClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
      cookies: {
        getAll: () => cookies.getAll(),
        setAll: (settable) => {
          for (const { name, value, options } of settable) {
            cookies.set(name, value, { ...COOKIE_OPTS, ...options });
          }
        },
      },
    });

    const { error } = await supabase.auth.updateUser({ password });
    if (error) return json({ error: error.message }, { status: 400 });

    return json({ ok: true });
  } catch (err) {
    console.error('[reset-password]', err);
    return json({ error: 'Reset failed — please try again' }, { status: 500 });
  }
}