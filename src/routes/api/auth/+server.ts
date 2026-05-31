import { json }     from '@sveltejs/kit';
import {
  getUserByEmail, verifyPassword, createSession, deleteSession,
  SESSION_COOKIE_NAME, SESSION_COOKIE_OPTS,
} from '$lib/server/auth';

export async function POST({ request, cookies }) {
  const { email, password } = await request.json();
  if (!email || !password)
    return json({ error: 'Email and password are required' }, { status: 400 });

  try {
    const user = await getUserByEmail(email);
    if (!user) return json({ error: 'Invalid email or password' }, { status: 401 });

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid)  return json({ error: 'Invalid email or password' }, { status: 401 });

    const token = await createSession(user.id);
    cookies.set(SESSION_COOKIE_NAME, token, SESSION_COOKIE_OPTS);
    return json({ ok: true, userId: user.id });
  } catch (err) {
    console.error('[auth login]', err);
    return json({ error: 'Login failed — please try again' }, { status: 500 });
  }
}

export async function DELETE({ cookies }) {
  const token = cookies.get(SESSION_COOKIE_NAME);
  if (token) {
    await deleteSession(token).catch(() => {});
  }
  cookies.delete(SESSION_COOKIE_NAME,   { path: '/' });
  cookies.delete('shelf-current-shop',  { path: '/' });
  return json({ ok: true });
}
