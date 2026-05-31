import { redirect } from '@sveltejs/kit';

export async function load({ locals, url }) {
  if (!locals.user) return; // not logged in → show the auth page

  // Logged in AND has a shop → go to the app
  if (locals.shopMember) {
    const next = url.searchParams.get('next');
    throw redirect(302, next ?? '/');
  }

  // Logged in but no shop → go to welcome (don't trap on login page)
  throw redirect(302, '/welcome');
}
