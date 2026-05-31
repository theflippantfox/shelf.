import { getEffectivePermissions, can } from '$lib/utils/permissions';
import type { Permission } from '$lib/config/permissions';

class AuthStore {
  #user   = $state<{ id: string; name: string; email: string; avatar: string | null } | null>(null);
  #member = $state<{ role: string; permissions: Record<string, boolean> | null } | null>(null);
  #perms  = $state<Record<Permission, boolean>>({} as Record<Permission, boolean>);

  get user()    { return this.#user; }
  get member()  { return this.#member; }
  get perms()   { return this.#perms; }
  get role()    { return this.#member?.role ?? 'cashier'; }
  get isOwner() { return this.#member?.role === 'owner'; }

  init(
    user: { id: string; first_name: string; last_name: string; email: string; avatar?: string | null } | null,
    member: { role: string; permissions?: Record<string, boolean> | null } | null,
  ) {
    this.#user = user
      ? { id: user.id, name: `${user.first_name} ${user.last_name}`.trim(), email: user.email, avatar: user.avatar ?? null }
      : null;
    this.#member = member ? { role: member.role, permissions: member.permissions ?? null } : null;
    this.#perms  = getEffectivePermissions(member?.role ?? 'cashier', member?.permissions ?? {});
  }

  can(permission: Permission): boolean {
    return can(this.#perms, permission);
  }
}

export const auth = new AuthStore();
