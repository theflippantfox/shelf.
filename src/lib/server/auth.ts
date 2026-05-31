import bcrypt from 'bcryptjs';
import { adminClient, readItems, createItem, deleteItem } from './directus';
import type { User } from '$lib/types/directus';

const SALT_ROUNDS    = 12;
const SESSION_DAYS   = 30;
const SESSION_COOKIE = 'shelf-session';

// ── Password ──────────────────────────────────────────────────────────────────

export const hashPassword   = (p: string)           => bcrypt.hash(p, SALT_ROUNDS);
export const verifyPassword = (p: string, h: string) => bcrypt.compare(p, h);

// ── Session ───────────────────────────────────────────────────────────────────

export async function createSession(userId: string): Promise<string> {
  const token      = crypto.randomUUID();
  const expires_at = new Date(Date.now() + SESSION_DAYS * 86_400_000).toISOString();
  await adminClient().request(createItem('sessions', { user: userId, token, expires_at }));
  return token;
}

export async function validateSession(token: string): Promise<string | null> {
  const rows = await adminClient().request(readItems('sessions', {
    filter: {
      token:      { _eq: token },
      expires_at: { _gt: new Date().toISOString() },
    },
    fields: ['user'],
    limit:  1,
  })) as any[];
  if (!rows.length) return null;
  return typeof rows[0].user === 'string' ? rows[0].user : rows[0].user?.id;
}

export async function deleteSession(token: string): Promise<void> {
  const rows = await adminClient().request(readItems('sessions', {
    filter: { token: { _eq: token } }, fields: ['id'], limit: 1,
  })) as any[];
  if (rows.length) await adminClient().request(deleteItem('sessions', rows[0].id));
}

// ── User lookup ───────────────────────────────────────────────────────────────

export async function getUserByEmail(email: string): Promise<User | null> {
  const rows = await adminClient().request(readItems('users', {
    filter: { email: { _eq: email.toLowerCase().trim() } },
    limit:  1,
  })) as User[];
  return rows[0] ?? null;
}

export async function getUserById(id: string): Promise<Omit<User, 'password_hash'> | null> {
  const rows = await adminClient().request(readItems('users', {
    filter: { id: { _eq: id } },
    fields: ['id', 'first_name', 'last_name', 'email', 'avatar', 'date_created'],
    limit:  1,
  })) as any[];
  return rows[0] ?? null;
}

// ── Cookie helpers (used by API routes) ───────────────────────────────────────

export const SESSION_COOKIE_NAME = SESSION_COOKIE;
export const SESSION_COOKIE_OPTS = {
  httpOnly: true,
  path:     '/',
  sameSite: 'lax' as const,
  maxAge:   SESSION_DAYS * 86_400,
};
