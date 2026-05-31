export const appConfig = {
  name: 'Shëlf',
  tagline: 'Your shop, simplified.',

  pagination: {
    defaultPageSize: 25,
    historyPageSize: 50,
  },

  tiers: {
    vip: {
      minVisits: 15,
      minSpentMinorUnits: 50000_00, // 500,000 in minor units
    },
    regular: {
      minVisits: 8,
      minSpentMinorUnits: 10000_00,
    },
  },

  sales: {
    saleRefPrefix: 'SL',
    voidWindowHours: 24,
  },

  inventory: {
    defaultLowStockThreshold: 10,
    units: ['piece', 'ml', 'g', 'set', 'pack', 'box', 'pair', 'sheet'] as const,
  },

  toasts: {
    defaultDurationMs: 3500,
    errorDurationMs: 5000,
  },

  onboarding: {
    steps: ['account', 'shop', 'locale', 'appearance', 'team', 'categories', 'complete'] as const,
    totalSteps: 7,
  },
} as const;

export type Unit = typeof appConfig.inventory.units[number];
