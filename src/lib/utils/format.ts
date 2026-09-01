import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(relativeTime);

// These are set by the shop store at runtime. Defaults below are used only
// before a shop is loaded (e.g. during SSR for unauthenticated pages) and
// are INR — change here to update the universal fallback.
let _timezone  = 'UTC';
let _currency  = 'INR';
let _locale    = 'en-IN';
let _dateFormat = 'D MMM YYYY';
let _timeFormat = '12h';

export function setFormatLocale(opts: {
  timezone:   string;
  currency:   string;
  locale:     string;
  dateFormat: string;
  timeFormat: string;
}) {
  _timezone   = opts.timezone;
  _currency   = opts.currency;
  _locale     = opts.locale;
  _dateFormat = opts.dateFormat;
  _timeFormat = opts.timeFormat;
}

/*
 * Money conventions in Shëlf:
 *
 *   - The DB stores amounts in MAJOR units (rupees, dollars, etc.) as
 *     numeric(10,2). For an item priced at ₹20, the products.price
 *     column holds 20, not 2000.
 *   - The cart sends totals in major units when it calls the sales API.
 *   - Every formatter below (formatCurrency, formatCurrencyCompact)
 *     takes a major-units value and returns a display string. There is
 *     no divide-by-100 anywhere on the read path.
 *   - The earlier "minor units" convention (multiply by 100 on write,
 *     divide by 100 on read) was abandoned because the cart and the
 *     DB both work in major units — see commit history.
 *
 * If you ever need to convert major ↔ minor for some other reason, use
 * plain arithmetic: `major * 100` and `minor / 100`.
 */

export function formatCurrency(amount: number): string {
  try {
    return new Intl.NumberFormat(_locale, {
      style:    'currency',
      currency: _currency,
      minimumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${_currency} ${amount.toFixed(2)}`;
  }
}

export function formatDate(d: string | Date): string {
  const fmtMap: Record<string, string> = {
    'DD/MM/YYYY': 'DD/MM/YYYY',
    'MM/DD/YYYY': 'MM/DD/YYYY',
    'YYYY-MM-DD': 'YYYY-MM-DD',
  };
  const fmt = fmtMap[_dateFormat] ?? 'D MMM YYYY';
  return dayjs(d).tz(_timezone).format(fmt);
}

export function formatTime(d: string | Date): string {
  return dayjs(d).tz(_timezone).format(_timeFormat === '24h' ? 'HH:mm' : 'h:mm A');
}

export function formatDateTime(d: string | Date): string {
  return `${formatDate(d)} · ${formatTime(d)}`;
}

export function formatRelative(d: string | Date): string {
  return dayjs(d).fromNow();
}

export function shopNow(): dayjs.Dayjs {
  return dayjs().tz(_timezone);
}

/**
 * Compact Indian-system number shorthand.
 *  999      → 999
 *  1.2k     → 1.2k
 *  18k      → 18k
 *  1.5L     → 1.5L    (1 Lakh = 100,000)
 *  12L      → 12L
 *  1.5Cr    → 1.5Cr   (1 Crore = 10,000,000)
 *  21Cr     → 21Cr
 *
 * Currency prefix (e.g. ₹) is added by callers; this returns the number part.
 * Decimals are trimmed: 18.0k → 18k, 1.50L → 1.5L.
 * Pass `currency=true` to also format without leading currency (e.g. for sub-labels
 * where we want the same look as formatCurrency).
 */
export function formatCompact(n: number, opts: { decimals?: number } = {}): string {
  const decimals = opts.decimals ?? 1;
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';

  if (abs < 1_000) {
    return `${sign}${abs.toFixed(0)}`;
  }
  if (abs < 100_000) {
    // k
    const v = abs / 1_000;
    return `${sign}${trimZeros(v.toFixed(decimals))}k`;
  }
  if (abs < 10_000_000) {
    // Lakh
    const v = abs / 100_000;
    return `${sign}${trimZeros(v.toFixed(decimals))}L`;
  }
  // Crore
  const v = abs / 10_000_000;
  return `${sign}${trimZeros(v.toFixed(decimals))}Cr`;
}

function trimZeros(s: string): string {
  if (!s.includes('.')) return s;
  return s.replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1');
}

/** Compact currency formatter — for KPI big numbers and table cells.
 *  Reads the active currency symbol from the Intl formatter when possible.
 *  Falls back to a manual prefix when the locale doesn't expose a symbol.
 *  Input is a major-units value (the same number you'd see in the DB).
 */
export function formatCurrencyCompact(amount: number): string {
  return `${getCurrencySymbol()}${formatCompact(amount)}`;
}

/** Return the active shop's currency symbol (e.g. "₹", "$", "€").
 *  Used by chart components and the command bar where the shop's full
 *  formatter isn't available. Reads the live Intl formatter when possible;
 *  falls back to the active currency code if the locale doesn't expose a
 *  dedicated symbol. */
export function getCurrencySymbol(): string {
  try {
    const parts = new Intl.NumberFormat(_locale, { style: 'currency', currency: _currency })
      .formatToParts(0);
    const sym = parts.find(p => p.type === 'currency')?.value;
    if (sym) return sym;
  } catch { /* keep _currency as text fallback */ }
  return _currency;
}

/** Format a major-units currency value (already in the shop's major unit,
 *  NOT minor) using the active shop's currency symbol. 1234.5 → "₹1,234.50".
 *  Used by chart axes and tooltips where the chart data is already in major
 *  units to avoid the divide-by-100 that Intl currency formatting applies. */
export function formatCurrencyMajor(major: number, opts: { decimals?: number } = {}): string {
  const decimals = opts.decimals ?? 0;
  return `${getCurrencySymbol()}${major.toLocaleString(_locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}
