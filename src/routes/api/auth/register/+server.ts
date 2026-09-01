/**
 * POST /api/auth/register
 * Creates a new Supabase Auth user, then signs them in (sets session cookie).
 * Profile row is auto-created by the on_auth_user_created DB trigger.
 */
import { json } from '@sveltejs/kit';
import { signUp } from '$lib/server/auth';
import { createServerClient } from '@supabase/ssr';
import { env } from '$env/dynamic/private';
import {
  PUBLIC_SUPABASE_URL,
  PUBLIC_SUPABASE_ANON_KEY,
} from '$env/static/public';
import { registerApiSchema } from '$lib/validators/schemas';
import { parseBody } from '$lib/validators/parseBody';

const COOKIE_OPTS = {
  path: '/',
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: false,
  maxAge: 60 * 60 * 24 * 30,
};

export async function POST({ request, cookies }: import('@sveltejs/kit').RequestEvent) {
  const parsed = await parseBody(request, registerApiSchema);
  if (!parsed.ok) return parsed.response;
  const { first_name, last_name, email, password } = parsed.data;

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
    // Log full error so we can diagnose 500s in Vercel runtime logs.
    // In production, Vercel captures console.error in the function logs.
    console.error('[auth register] full error:', err);
    const msg = err?.message?.includes('already') ? 'An account with that email already exists' : 'Registration failed — please try again';
    return json({
      error: msg,
      ...(env.VERCEL_ENV ? { debug: String(err?.message ?? err) } : {}),
    }, { status: err?.message?.includes('already') ? 409 : 500 });
  }
}