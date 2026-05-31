export interface Country {
  code:     string;
  name:     string;
  timezone: string;
  currency: string;
  locale:   string;
}

export const COUNTRIES: Country[] = [
  { code: 'NG', name: 'Nigeria',              timezone: 'Africa/Lagos',        currency: 'NGN', locale: 'en-NG' },
  { code: 'US', name: 'United States',        timezone: 'America/New_York',    currency: 'USD', locale: 'en-US' },
  { code: 'GB', name: 'United Kingdom',       timezone: 'Europe/London',       currency: 'GBP', locale: 'en-GB' },
  { code: 'KE', name: 'Kenya',                timezone: 'Africa/Nairobi',      currency: 'KES', locale: 'en-KE' },
  { code: 'GH', name: 'Ghana',                timezone: 'Africa/Accra',        currency: 'GHS', locale: 'en-GH' },
  { code: 'ZA', name: 'South Africa',         timezone: 'Africa/Johannesburg', currency: 'ZAR', locale: 'en-ZA' },
  { code: 'IN', name: 'India',                timezone: 'Asia/Kolkata',        currency: 'INR', locale: 'en-IN' },
  { code: 'EG', name: 'Egypt',                timezone: 'Africa/Cairo',        currency: 'EGP', locale: 'ar-EG' },
  { code: 'PK', name: 'Pakistan',             timezone: 'Asia/Karachi',        currency: 'PKR', locale: 'en-PK' },
  { code: 'BD', name: 'Bangladesh',           timezone: 'Asia/Dhaka',          currency: 'BDT', locale: 'bn-BD' },
  { code: 'PH', name: 'Philippines',          timezone: 'Asia/Manila',         currency: 'PHP', locale: 'en-PH' },
  { code: 'ID', name: 'Indonesia',            timezone: 'Asia/Jakarta',        currency: 'IDR', locale: 'id-ID' },
  { code: 'MY', name: 'Malaysia',             timezone: 'Asia/Kuala_Lumpur',   currency: 'MYR', locale: 'ms-MY' },
  { code: 'CA', name: 'Canada',               timezone: 'America/Toronto',     currency: 'CAD', locale: 'en-CA' },
  { code: 'AU', name: 'Australia',            timezone: 'Australia/Sydney',    currency: 'AUD', locale: 'en-AU' },
  { code: 'JP', name: 'Japan',                timezone: 'Asia/Tokyo',          currency: 'JPY', locale: 'ja-JP' },
  { code: 'CN', name: 'China',                timezone: 'Asia/Shanghai',       currency: 'CNY', locale: 'zh-CN' },
  { code: 'BR', name: 'Brazil',               timezone: 'America/Sao_Paulo',   currency: 'BRL', locale: 'pt-BR' },
  { code: 'MX', name: 'Mexico',               timezone: 'America/Mexico_City', currency: 'MXN', locale: 'es-MX' },
  { code: 'AE', name: 'United Arab Emirates', timezone: 'Asia/Dubai',          currency: 'AED', locale: 'ar-AE' },
  { code: 'DE', name: 'Germany',              timezone: 'Europe/Berlin',       currency: 'EUR', locale: 'de-DE' },
  { code: 'FR', name: 'France',               timezone: 'Europe/Paris',        currency: 'EUR', locale: 'fr-FR' },
];

export function getCountry(code: string): Country | undefined {
  return COUNTRIES.find(c => c.code === code);
}
