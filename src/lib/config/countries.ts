export interface Country {
  code:     string;
  name:     string;
  timezone: string;
  currency: string;
  locale:   string;
}

export const COUNTRIES: Country[] = [
  { code: 'IN', name: 'India',                timezone: 'Asia/Kolkata',        currency: 'INR', locale: 'en-IN' },
];

export function getCountry(code: string): Country | undefined {
  return COUNTRIES.find(c => c.code === code);
}
