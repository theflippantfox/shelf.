import { json }     from '@sveltejs/kit';
import {
  hashPassword, createSession, getUserByEmail,
  SESSION_COOKIE_NAME, SESSION_COOKIE_OPTS,
} from '$lib/server/auth';
import { adminClient, readItems, createItem } from '$lib/server/directus';

export async function POST({ request, cookies }) {
  const { first_name, last_name, email, password } = await request.json();

  if (!first_name?.trim())
    return json({ error: 'First name is required' }, { status: 400 });
  if (!email?.trim())
    return json({ error: 'Email is required' }, { status: 400 });
  if (!password || password.length < 8)
    return json({ error: 'Password must be at least 8 characters' }, { status: 400 });

  try {
    // Check for existing account
    const existing = await getUserByEmail(email);
    if (existing) return json({ error: 'An account with that email already exists' }, { status: 409 });

    const password_hash = await hashPassword(password);

    const client = adminClient();
    const user   = await client.request(createItem('users', {
      first_name:    first_name.trim(),
      last_name:     (last_name ?? '').trim(),
      email:         email.toLowerCase().trim(),
      password_hash,
    })) as any;

    const token = await createSession(user.id);
    cookies.set(SESSION_COOKIE_NAME, token, SESSION_COOKIE_OPTS);

    return json({ ok: true, userId: user.id }, { status: 201 });
  } catch (err) {
    console.error('[auth register]', err);
    return json({ error: 'Registration failed — please try again' }, { status: 500 });
  }
}
