import { json }     from '@sveltejs/kit';
import { getUserByEmail, hashPassword } from '$lib/server/auth';
import { adminClient, updateItem } from '$lib/server/directus';

// In production wire this up to an email provider (Resend, Postmark, etc.)
// For now it generates a reset token and logs it — replace the console.log
// with an email send call.

export async function POST({ request }) {
  const { email } = await request.json();
  if (!email) return json({ error: 'Email required' }, { status: 400 });

  // Always return 200 — don't reveal whether the account exists
  try {
    const user = await getUserByEmail(email);
    if (user) {
      const reset_token  = crypto.randomUUID();
      const reset_expiry = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

      await adminClient().request(updateItem('users', user.id, {
        reset_token,
        reset_token_expires_at: reset_expiry,
      }));

      // TODO: replace with real email
      console.log(
        `[Shëlf] Password reset for ${email}:\n` +
        `  Token: ${reset_token}\n` +
        `  Link:  ${process.env.ORIGIN}/reset-password?token=${reset_token}`
      );
    }
  } catch (err) {
    console.error('[forgot-password]', err);
  }

  return json({ ok: true });
}
