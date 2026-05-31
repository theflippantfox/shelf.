export interface Currency {
  code:   string;
  symbol: string;
  name:   string;
  locale: string;
}

export const CURRENCIES: Currency[] = [
  { code: 'NGN', symbol: '₦',   name: 'Nigerian Naira',        locale: 'en-NG' },
  { code: 'USD', symbol: '$',   name: 'US Dollar',             locale: 'en-US' },
  { code: 'EUR', symbol: '€',   name: 'Euro',                  locale: 'en-DE' },
  { code: 'GBP', symbol: '£',   name: 'British Pound',         locale: 'en-GB' },
  { code: 'KES', symbol: 'KSh', name: 'Kenyan Shilling',       locale: 'en-KE' },
  { code: 'GHS', symbol: '₵',   name: 'Ghanaian Cedi',         locale: 'en-GH' },
  { code: 'ZAR', symbol: 'R',   name: 'South African Rand',    locale: 'en-ZA' },
  { code: 'EGP', symbol: 'E£',  name: 'Egyptian Pound',        locale: 'ar-EG' },
  { code: 'INR', symbol: '₹',   name: 'Indian Rupee',          locale: 'en-IN' },
  { code: 'PKR', symbol: '₨',   name: 'Pakistani Rupee',       locale: 'en-PK' },
  { code: 'BDT', symbol: '৳',   name: 'Bangladeshi Taka',      locale: 'bn-BD' },
  { code: 'PHP', symbol: '₱',   name: 'Philippine Peso',       locale: 'en-PH' },
  { code: 'IDR', symbol: 'Rp',  name: 'Indonesian Rupiah',     locale: 'id-ID' },
  { code: 'MYR', symbol: 'RM',  name: 'Malaysian Ringgit',     locale: 'ms-MY' },
  { code: 'CAD', symbol: 'CA$', name: 'Canadian Dollar',       locale: 'en-CA' },
  { code: 'AUD', symbol: 'A$',  name: 'Australian Dollar',     locale: 'en-AU' },
  { code: 'JPY', symbol: '¥',   name: 'Japanese Yen',          locale: 'ja-JP' },
  { code: 'CNY', symbol: '¥',   name: 'Chinese Yuan',          locale: 'zh-CN' },
  { code: 'BRL', symbol: 'R$',  name: 'Brazilian Real',        locale: 'pt-BR' },
  { code: 'MXN', symbol: 'MX$', name: 'Mexican Peso',          locale: 'es-MX' },
  { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham',            locale: 'ar-AE' },
];

export function getCurrency(code: string): Currency | undefined {
  return CURRENCIES.find(c => c.code === code);
}
