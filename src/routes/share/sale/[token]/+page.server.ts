import { error } from '@sveltejs/kit';
import { userClient, userClientFromCtx } from '$lib/server/supabase';

/**
 * /share/sale/[token] — public, unauthenticated receipt view.
 *
 * Uses the anon Supabase client (NOT userClientFromCtx — there's no
 * logged-in user) + the anon-key RLS policy `sales_public_share_select`
 * to look up the sale by its share_token. The policy only allows
 * reads when sharing_enabled = true.
 *
 * Returns the slimmed-down sale view + the line items. Customer
 * phone/email + internal notes are not exposed here.
 */
export async function load({ params, cookies, url }: import('@sveltejs/kit').RequestEvent) {
  const token = params.token;
  if (!token) throw error(404, 'Invalid share link');

  // 1. Lookup the sale header. Use the public view so RLS is
  //    enforced for anon.
  const supabase = userClient({ cookies } as any);
  const { data: header, error: hdrErr } = await supabase
    .from('sale_share_view')
    .select('*')
    .eq('share_token', token)
    .single();
  if (hdrErr || !header) throw error(404, 'Receipt not found or sharing disabled');

  // 2. Items. Use a fresh anon client and only the public-safe
  //    columns. RLS on sale_items is the standard member policy,
  //    but for anon we need a separate permissive policy OR we
  //    can just gate this read by checking the parent sale's
  //    sharing_enabled.
  //    Simpler approach: use userClientFromCtx (which is anon in
  //    this case because there's no JWT) with a server-side check
  //    that the parent sale is shared.
  const { data: items } = await supabase
    .from('sale_items')
    .select('product_name, product_sku, qty, unit_price, line_total')
    .eq('sale_id', header.id);

  return {
    sale:    header,
    items:   items ?? [],
    isVoided: !!header.voided_at,
  };
}
