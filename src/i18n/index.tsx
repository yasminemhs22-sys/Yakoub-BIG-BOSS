import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { fr } from './locales/fr';
import { ar } from './locales/ar';
import {
  type Locale,
  dirOf,
  formatDate,
  formatNumber,
  formatPrice,
  pickLocalised,
} from './locale';

const DICTIONARIES = { fr, ar } as const;

interface I18nValue {
  locale: Locale;
  dir: 'ltr' | 'rtl';
  t: typeof fr;
  /** Formats a DZD amount with Western digits in both locales (D-096). */
  price: (amount: number) => string;
  number: (value: number) => string;
  date: (value: string | Date) => string;
  /** Bilingual DB content with silent French fallback (D-093, D-094). */
  pick: (values: { fr?: string | null; ar?: string | null }) => string;
  /** Prefixes a path with the active locale, e.g. `/fr/boutique`. */
  path: (to: string) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  const value = useMemo<I18nValue>(
    () => ({
      locale,
      dir: dirOf(locale),
      t: DICTIONARIES[locale],
      price: (amount) => formatPrice(amount, locale),
      number: (v) => formatNumber(v, locale),
      date: (v) => formatDate(v, locale),
      pick: (values) => pickLocalised(locale, values),
      path: (to) => `/${locale}${to.startsWith('/') ? to : `/${to}`}`.replace(/\/$/, '') || `/${locale}`,
    }),
    [locale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    // A component rendering outside the provider would silently fall back to
    // French and look almost right, which is the hardest kind of bug to see.
    throw new Error('useI18n must be used inside <I18nProvider>');
  }
  return ctx;
}

/**
 * Fills `{name}` placeholders, e.g. `lastUnits: 'Plus que {count}'`.
 *
 * Deliberately not a full ICU implementation: plural rules differ sharply
 * between French and Arabic, and pretending otherwise would produce
 * confidently wrong grammar. When a real plural is needed, the dictionary gets
 * separate keys and the component chooses.
 */
export function interpolate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}
