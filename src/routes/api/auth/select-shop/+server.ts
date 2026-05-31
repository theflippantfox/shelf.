import { json } from '@sveltejs/kit';
export async function POST({ request, cookies }) {
  const { shopId } = await request.json();
  if (!shopId) return json({ error: 'shopId required' }, { status: 400 });
  cookies.set('shelf-current-shop', shopId, { path: '/', sameSite: 'lax', maxAge: 60*60*24*30 });
  return json({ ok: true });
}
