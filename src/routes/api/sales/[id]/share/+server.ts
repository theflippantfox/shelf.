import { json, error } from '@sveltejs/kit';
import { userClientFromCtx } from '$lib/server/supabase';

/**
 * POST /api/sales/[id]/share — enable (or regenerate) the shareable
 * link for this sale. Returns the absolute URL the cashier should
 * send to the customer.
 *
 * The link is /share/sale/[token] and is public (no login required).
 * The cashier can re-call this endpoint to invalidate the old link
 * (a fresh token is minted) — useful if the customer lost the link
 * or it leaked somewhere.
 *
 * If sharing is already enabled, the existing token is REPLACED with
 * a fresh one. The old URL stops resolving.
 *
 * Body (optional):
 *   { enabled: boolean }  // default true. Set false to disable
 *                          // sharing without re-minting a token.
 *
 * Response:
 *   { ok, enabled, url, token }
 */
export async function POST({ cookies, params, request, locals }: import('@sveltejs/kit').RequestEvent) {
  if (!params.id)          throw error(400, 'Missing sale id');
  if (!locals.currentShop) throw error(401, 'No shop');

  let body: any = {};
  try { body = await request.json(); } catch { /* empty body is OK */ }
  const enable = body?.enabled !== false;  // default true

  const supabase = userClientFromCtx({ cookies } as any);
  // We always mint a fresh token (whether enabling or re-enabling) so
  // the old URL stops working. Disable sets sharing_enabled=false and
  // nulls the token; re-enable mints a new one.
  const update: Record<string, any> = { sharing_enabled: enable };
  if (enable) {
    // PostgREST doesn't accept gen_random_uuid() in an update payload
    // directly, so we generate the token on the server side via a
    // round-trip. Cheaper: use crypto.randomUUID() in the JS layer.
    update.share_token = crypto.randomUUID();
  } else {
    update.share_token = null;
  }
  const { data, error: upErr } = await supabase
    .from('sales')
    .update(update as any)
    .eq('id', params.id)
    .select('share_token, sharing_enabled')
    .single();
  if (upErr || !data) throw error(500, upErr?.message ?? 'Could not update share settings');

  // If we just disabled, the token is null. Return URL=null in that
  // case so the UI can show "Sharing disabled".
  const origin = new URL(request.url).origin;
  const url    = data.sharing_enabled && data.share_token
    ? `${origin}/share/sale/${data.share_token}`
    : null;

  return json({ ok: true, enabled: data.sharing_enabled, url, token: data.share_token });
}

/**
 * GET /api/sales/[id]/share — return the current share status for
 * the sale (so the UI can show "Sharing on/off" without POSTing).
 */
export async function GET({ cookies, params, locals, request }: import('@sveltejs/kit').RequestEvent) {
  if (!params.id)          throw error(400, 'Missing sale id');
  if (!locals.currentShop) throw error(401, 'No shop');

  const supabase = userClientFromCtx({ cookies } as any);
  const { data, error: rErr } = await supabase
    .from('sales')
    .select('share_token, sharing_enabled')
    .eq('id', params.id)
    .single();
  if (rErr || !data) throw error(500, rErr?.message ?? 'Could not read share settings');

  const origin = new URL(request.url).origin;
  const url    = data.sharing_enabled && data.share_token
    ? `${origin}/share/sale/${data.share_token}`
    : null;
  return json({ enabled: data.sharing_enabled, url, token: data.share_token });
}
