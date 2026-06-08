export interface Currency {
  code:   string;
  symbol: string;
  name:   string;
  locale: string;
}

export const CURRENCIES: Currency[] = [
  { code: 'INR', symbol: '₹',   name: 'Indian Rupee',          locale: 'en-IN' },
];

export function getCurrency(code: string): Currency | undefined {
  return CURRENCIES.find(c => c.code === code);
}
