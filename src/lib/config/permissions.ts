export const PERMISSIONS = [
  'sales.create',
  'sales.void',
  'sales.view_all',
  'inventory.view',
  'inventory.manage',
  'customers.view',
  'customers.manage',
  'analytics.view',
  'reports.export',
  'settings.view',
  'settings.manage',
  'users.manage',
] as const;

export type Permission = typeof PERMISSIONS[number];

export const ROLE_DEFAULTS: Record<string, Record<Permission, boolean>> = {
  owner: {
    'sales.create': true,
    'sales.void': true,
    'sales.view_all': true,
    'inventory.view': true,
    'inventory.manage': true,
    'customers.view': true,
    'customers.manage': true,
    'analytics.view': true,
    'reports.export': true,
    'settings.view': true,
    'settings.manage': true,
    'users.manage': true,
  },
  manager: {
    'sales.create': true,
    'sales.void': true,
    'sales.view_all': true,
    'inventory.view': true,
    'inventory.manage': true,
    'customers.view': true,
    'customers.manage': true,
    'analytics.view': true,
    'reports.export': true,
    'settings.view': false,
    'settings.manage': false,
    'users.manage': false,
  },
  cashier: {
    'sales.create': true,
    'sales.void': false,
    'sales.view_all': false,
    'inventory.view': true,
    'inventory.manage': false,
    'customers.view': true,
    'customers.manage': true,
    'analytics.view': false,
    'reports.export': false,
    'settings.view': false,
    'settings.manage': false,
    'users.manage': false,
  },
};

export const ROLES = ['owner', 'manager', 'cashier'] as const;
export type Role = typeof ROLES[number];
