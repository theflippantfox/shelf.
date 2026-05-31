import { json }     from '@sveltejs/kit';
import { adminClient, readItems, createItem } from '$lib/server/directus';
import { hashPassword, getUserByEmail } from '$lib/server/auth';

export async function GET({ locals }) {
  if (!locals.currentShop) return json([]);
  const members = await adminClient().request(readItems('shop_members', {
    filter: { shop: { _eq: locals.currentShop.id } },
    fields: [
      'id', 'role', 'status', 'permissions',
      'user.id', 'user.first_name', 'user.last_name', 'user.email', 'user.avatar',
    ],
    sort:  ['role', 'user.first_name'],
    limit: -1,
  }));
  return json(members);
}

export async function POST({ request, locals }) {
  if (!locals.currentShop || locals.shopMember?.role !== 'owner')
    return json({ error: 'Only shop owners can add team members' }, { status: 403 });

  const { first_name, last_name, email, password, role } = await request.json();
  if (!email || !password || !role)
    return json({ error: 'email, password and role are required' }, { status: 400 });
  if (password.length < 8)
    return json({ error: 'Password must be at least 8 characters' }, { status: 400 });

  const client = adminClient();

  // Check if a user with this email already exists
  let userId: string;
  const existing = await getUserByEmail(email);

  if (existing) {
    // User already has a Shëlf account — just add them to this shop
    userId = existing.id;

    // Make sure they aren't already a member
    const alreadyMember = await client.request(readItems('shop_members', {
      filter: { shop: { _eq: locals.currentShop.id }, user: { _eq: userId } },
      limit:  1,
    })) as any[];
    if (alreadyMember.length)
      return json({ error: 'This person is already a member of your shop' }, { status: 409 });
  } else {
    // Create a new Shëlf account for them
    const password_hash = await hashPassword(password);
    const newUser = await client.request(createItem('users', {
      first_name:  first_name ?? '',
      last_name:   last_name  ?? '',
      email:       email.toLowerCase().trim(),
      password_hash,
    })) as any;
    userId = newUser.id;
  }

  const member = await client.request(createItem('shop_members', {
    shop:   locals.currentShop.id,
    user:   userId,
    role,
    status: 'active',
  }));

  return json(member, { status: 201 });
}
