import { redirect } from '@sveltejs/kit';
// The account creation step is now at /signup.
// /onboarding starts at /onboarding/shop for users who already have an account.
export function load({ locals }) {
  if (locals.user) throw redirect(302, '/onboarding/shop');
  throw redirect(302, '/signup');
}
