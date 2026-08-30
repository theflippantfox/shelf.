/**
 * POST /api/auth/register
 * Creates a new Supabase Auth user, then signs them in (sets session cookie).
 * Profile row is auto-created by the on_auth_user_created DB trigger.
 */
import { json } from '@sveltejs/kit';
import { signUp, getCurrentUser } from '$lib/server/auth';
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
  const { first_name, last_name, email, password } = await request.json();

  if (!first_name?.trim())
    return json({ error: 'First name is required' }, { status: 400 });
  if (!email?.trim())
    return json({ error: 'Email is required' }, { status: 400 });
  if (!password || password.length < 8)
    return json({ error: 'Password must be at least 8 characters' }, { status: 400 });

  try {
    const userId = await signUp(email, password, first_name.trim(), (last_name ?? '').trim());

    // Sign the user in immediately so the session cookie is set.
    // We use the same anon-key client pattern as /api/auth.
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

    const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
    if (signInErr) {
      // Account created but auto-login failed — user can sign in manually
      console.error('[auth register] auto-login failed:', signInErr);
      return json({ ok: true, userId, warning: 'Account created — please sign in' }, { status: 201 });
    }

    return json({ ok: true, userId }, { status: 201 });
  } catch (err: any) {
    console.error('[auth register]', err);
    const msg = err?.message?.includes('already') ? 'An account with that email already exists' : 'Registration failed — please try again';
    return json({ error: msg }, { status: err?.message?.includes('already') ? 409 : 500 });
  }
}