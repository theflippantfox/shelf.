import { ROLE_DEFAULTS, type Permission } from '$lib/config/permissions';

export function getEffectivePermissions(
  role: string,
  overrides: Partial<Record<Permission, boolean>> = {}
): Record<Permission, boolean> {
  const base = ROLE_DEFAULTS[role] ?? ROLE_DEFAULTS.cashier;
  return { ...base, ...overrides };
}

export function can(perms: Record<Permission, boolean>, permission: Permission): boolean {
  return perms[permission] === true;
}
