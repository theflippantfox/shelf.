/**
 * /api/onboarding/team — create invited teammates (onboarding-time only).
 *
 * Supabase note: the user provides a password during onboarding because the
 * default email confirmation flow requires a real SMTP server. After onboarding
 * is complete, teammates should be invited via /api/users which uses Supabase's
 * built-in invite (recovery link).
 */
import { json } from '@sveltejs/kit';
import { adminClient, userClient, userClientFromCtx } from '$lib/server/supabase';

export async function POST({ cookies, request, locals }: import('@sveltejs/kit').RequestEvent) {
  if (!locals.currentShop || !locals.user)
    return json({ error: 'No shop context' }, { status: 401 });

  const { invites } = (await request.json()) as {
    invites: { first_name: string; email: string; password: string; role: string }[];
  };

  const admin = adminClient();
  const supabase = userClientFromCtx({ cookies } as any);
  const failures: string[] = [];

  for (const invite of invites ?? []) {
    if (!invite.email || !invite.password) continue;
    try {
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email: invite.email,
        password: invite.password,
        email_confirm: true,
        user_metadata: { first_name: invite.first_name, last_name: '' },
      });
      if (createErr || !created?.user) {
        failures.push(`${invite.email}: ${createErr?.message ?? 'failed'}`);
        continue;
      }

      const { error: memberErr } = await admin
        .from('shop_members')
        .insert({
          shop_id: locals.currentShop.id,
          user_id: created.user.id,
          role: invite.role ?? 'cashier',
          status: 'active',
        });

      if (memberErr) {
        failures.push(`${invite.email}: ${memberErr.message}`);
      }
    } catch {
      failures.push(`${invite.email}: unexpected error`);
    }
  }

  // Advance the onboarding step regardless of partial failures
  await supabase
    .from('shops')
    .update({ onboarding_step: 'categories' })
    .eq('id', locals.currentShop.id);

  if (failures.length > 0) {
    return json({ ok: true, warnings: failures });
  }
  return json({ ok: true });
}