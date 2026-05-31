import { json }     from '@sveltejs/kit';
import { hashPassword, createSession, SESSION_COOKIE_NAME, SESSION_COOKIE_OPTS } from '$lib/server/auth';
import { adminClient, readItems, updateItem } from '$lib/server/directus';

export async function POST({ request, cookies }) {
  const { token, password } = await request.json();
  if (!token || !password || password.length < 8)
    return json({ error: 'Token and password (min 8 chars) are required' }, { status: 400 });

  try {
    const users = await adminClient().request(readItems('users', {
      filter: {
        reset_token:            { _eq: token },
        reset_token_expires_at: { _gt: new Date().toISOString() },
      },
      fields: ['id'],
      limit:  1,
    })) as any[];

    if (!users.length) return json({ error: 'Reset link is invalid or has expired' }, { status: 400 });

    const userId       = users[0].id;
    const password_hash = await hashPassword(password);

    await adminClient().request(updateItem('users', userId, {
      password_hash,
      reset_token:            null,
      reset_token_expires_at: null,
    }));

    const sessionToken = await createSession(userId);
    cookies.set(SESSION_COOKIE_NAME, sessionToken, SESSION_COOKIE_OPTS);

    return json({ ok: true });
  } catch (err) {
    console.error('[reset-password]', err);
    return json({ error: 'Reset failed — please try again' }, { status: 500 });
  }
}
