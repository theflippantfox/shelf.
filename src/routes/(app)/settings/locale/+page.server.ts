import { redirect } from '@sveltejs/kit';
export async function load({ locals }) {
  if (!locals.currentShop) throw redirect(302, '/');
  return { shop: locals.currentShop };
}
