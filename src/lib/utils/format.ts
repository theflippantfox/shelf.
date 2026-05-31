import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(relativeTime);

// These are set by the shop store at runtime
let _timezone  = 'UTC';
let _currency  = 'USD';
let _locale    = 'en-US';
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

export function formatCurrency(minorUnits: number): string {
  try {
    return new Intl.NumberFormat(_locale, {
      style:    'currency',
      currency: _currency,
      minimumFractionDigits: 2,
    }).format(minorUnits / 100);
  } catch {
    return `${_currency} ${(minorUnits / 100).toFixed(2)}`;
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

export function fromMinorUnits(minor: number): number {
  return minor / 100;
}

export function toMinorUnits(amount: number): number {
  return Math.round(amount * 100);
}
