import type { Permission } from '$lib/config/permissions';

export interface NavItem {
  label: string;
  href: string;
  icon: string;
  section?: string;
  permission?: Permission;
  showAlert?: boolean;
  mobileNav?: boolean;
  mobileOrder?: number;
}

export const navItems: NavItem[] = [
  { label: 'Dashboard', href: '/', icon: 'dashboard', section: 'Main', mobileNav: true, mobileOrder: 1 },
  { label: 'Point of Sale', href: '/sale', icon: 'sale', section: 'Main' },
  { label: 'Inventory', href: '/inventory', icon: 'inventory', section: 'Stock', mobileNav: true, mobileOrder: 2, showAlert: true, permission: 'inventory.view' },
  { label: 'Restocking', href: '/restocking', icon: 'PackagePlus', section: 'Stock', mobileNav: false, permission: 'inventory.view' },
  { label: 'Suppliers', href: '/restocking/suppliers', icon: 'business', section: 'Stock', mobileNav: false, permission: 'inventory.view' },
  { label: 'Customers', href: '/customers', icon: 'customers', section: 'Customers', mobileNav: true, mobileOrder: 3, permission: 'customers.view' },
  { label: 'Sales History', href: '/history', icon: 'history', section: 'Records', mobileNav: true, mobileOrder: 4, permission: 'sales.view_all' },
  { label: 'Analytics', href: '/analytics', icon: 'analytics', section: 'Records', mobileNav: false, permission: 'analytics.view' },
  { label: 'Settings', href: '/settings', icon: 'settings', section: 'Config', permission: 'settings.view' },
];
