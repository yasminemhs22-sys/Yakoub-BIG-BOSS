import { useEffect } from 'react';
import { Navigate, Outlet, useParams } from 'react-router-dom';
import { I18nProvider } from '@/i18n';
import { applyLocaleToDocument, detectLocale, isLocale, persistLocale } from '@/i18n/locale';

/**
 * Every page lives under `/fr/…` or `/ar/…`.
 *
 * The prefix is not cosmetic: it gives each language its own indexable URL tree
 * with proper hreflang (D-099). Switching language stays instant on the client,
 * but Google and the social crawlers see two distinct, crawlable sites.
 */
export function LocaleLayout() {
  const { locale } = useParams();

  useEffect(() => {
    if (isLocale(locale)) {
      applyLocaleToDocument(locale);
      persistLocale(locale);
    }
  }, [locale]);

  // An unknown prefix (/en/…, /xx/…) is not a 404 — the person asked for a page
  // that exists, in a language we do not have. Send them to the same path in
  // their detected language rather than a dead end.
  if (!isLocale(locale)) {
    return <Navigate to={`/${detectLocale()}`} replace />;
  }

  return (
    <I18nProvider locale={locale}>
      <Outlet />
    </I18nProvider>
  );
}

/** Bare `/` — resolve the language once, then hand over to LocaleLayout. */
export function RootRedirect() {
  return <Navigate to={`/${detectLocale()}`} replace />;
}
