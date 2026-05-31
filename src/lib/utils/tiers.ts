import { appConfig } from '$lib/config/app';
import type { RecordModel } from 'pocketbase';

export type CustomerTier = 'vip' | 'regular' | 'new';

export function getCustomerTier(customer: RecordModel): CustomerTier {
  const { vip, regular } = appConfig.tiers;
  if (
    customer.visit_count >= vip.minVisits ||
    customer.total_spent >= vip.minSpentMinorUnits
  ) return 'vip';

  if (
    customer.visit_count >= regular.minVisits ||
    customer.total_spent >= regular.minSpentMinorUnits
  ) return 'regular';

  return 'new';
}

export const TIER_LABELS: Record<CustomerTier, string> = {
  vip:     'VIP',
  regular: 'Regular',
  new:     'New',
};

export const TIER_BADGE_CLASS: Record<CustomerTier, string> = {
  vip:     'badge-rose',
  regular: 'badge-primary',
  new:     'badge-cobalt',
};
