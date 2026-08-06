export const LOCALES = ['fr', 'ar'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'fr';
const STORAGE_KEY = 'ybb.locale';

export function isLocale(value: unknown): value is Locale {
  return value === 'fr' || value === 'ar';
}

export function dirOf(locale: Locale): 'ltr' | 'rtl' {
  return locale === 'ar' ? 'rtl' : 'ltr';
}

/**
 * First visit: detect the browser language, Arabic wins if present, French
 * otherwise. An explicit choice, once made, always outranks detection (D-097,
 * D-098).
 *
 * Must mirror the inline script in index.html. If one changes, change both —
 * a mismatch produces exactly the flash that script exists to prevent.
 */
export function detectLocale(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isLocale(stored)) return stored;
  } catch {
    // Private browsing can block localStorage. Fall through to detection.
  }
  const nav = typeof navigator !== 'undefined' ? navigator.language : '';
  return nav.toLowerCase().startsWith('ar') ? 'ar' : DEFAULT_LOCALE;
}

export function persistLocale(locale: Locale): void {
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // Not fatal: the URL prefix still carries the locale for this session.
  }
}

/**
 * Applies the locale to <html>.
 *
 * `lang` and `dir` are not cosmetic. Screen readers switch voice on `lang`, and
 * `dir` is what mirrors the entire layout — combined with CSS logical
 * properties, this is the whole of RTL support.
 */
export function applyLocaleToDocument(locale: Locale): void {
  const html = document.documentElement;
  html.lang = locale;
  html.dir = dirOf(locale);
}

/* ---------------------------------------------------------------------------
   Formatting
   --------------------------------------------------------------------------- */

/**
 * Prices.
 *
 * Western digits in both locales (D-096) — `1500 DZD` and `1500 د.ج`, never
 * `١٥٠٠`. `ar` alone would render Arabic-Indic digits on most browsers, so the
 * locale is pinned to `ar-DZ-u-nu-latn`, which forces Latin numerals.
 *
 * Whole dinars only: Algerian retail does not price in centimes.
 */
const priceFormatters: Record<Locale, Intl.NumberFormat> = {
  fr: new Intl.NumberFormat('fr-DZ', { maximumFractionDigits: 0 }),
  ar: new Intl.NumberFormat('ar-DZ-u-nu-latn', { maximumFractionDigits: 0 }),
};

const CURRENCY_LABEL: Record<Locale, string> = { fr: 'DZD', ar: 'د.ج' };

export function formatPrice(amount: number, locale: Locale): string {
  return `${priceFormatters[locale].format(amount)} ${CURRENCY_LABEL[locale]}`;
}

export function formatNumber(value: number, locale: Locale): string {
  return priceFormatters[locale].format(value);
}

const dateFormatters: Record<Locale, Intl.DateTimeFormat> = {
  fr: new Intl.DateTimeFormat('fr-DZ', { day: '2-digit', month: '2-digit', year: 'numeric' }),
  ar: new Intl.DateTimeFormat('ar-DZ-u-nu-latn', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }),
};

export function formatDate(value: string | Date, locale: Locale): string {
  return dateFormatters[locale].format(typeof value === 'string' ? new Date(value) : value);
}

/**
 * Bilingual content with silent French fallback (D-093, D-094).
 *
 * The customer never sees a marker, a notice or an empty section. The dashboard
 * is where missing translations are surfaced, loudly — not here.
 */
export function pickLocalised(
  locale: Locale,
  values: { fr?: string | null; ar?: string | null },
): string {
  if (locale === 'ar') return values.ar?.trim() || values.fr?.trim() || '';
  return values.fr?.trim() || values.ar?.trim() || '';
}
