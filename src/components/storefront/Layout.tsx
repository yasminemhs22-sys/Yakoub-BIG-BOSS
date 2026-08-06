import { Link, NavLink, Outlet } from 'react-router-dom';
import { useState } from 'react';
import { useI18n } from '@/i18n';
import { LanguageSwitch } from '@/components/LanguageSwitch';
import { useSettings } from '@/lib/queries/settings';
import { useVisibleCategories } from '@/lib/queries/storefront';
import { Brand } from '@/components/Brand';

/**
 * Storefront chrome.
 *
 * Mobile-first without apology: almost every visitor arrives from a TikTok or
 * Instagram bio link on a phone. The desktop layout is the adaptation, not the
 * other way round.
 *
 * The sticky bottom bar mirrors the pattern Algerian shoppers already know from
 * local apps, and keeps WhatsApp one tap away — for many customers that is the
 * channel they trust more than any web form.
 */
export function StorefrontLayout() {
  const { t, path, locale, pick } = useI18n();
  const { data: settings } = useSettings();
  const { data: categories } = useVisibleCategories();
  const [menuOpen, setMenuOpen] = useState(false);

  const phone = (settings?.['business.phone'] as string) ?? '';
  const whatsapp = (settings?.['business.whatsapp'] as string) ?? phone;
  const waLink = whatsapp
    ? `https://wa.me/213${whatsapp.replace(/^0/, '').replace(/\D/g, '')}`
    : null;

  const topLevel = (categories ?? []).filter((c) => !c.parent_id);

  return (
    <div className="min-h-dvh pb-16 lg:pb-0">
      {/* Keyboard users should not have to tab through the whole nav on every
          page. Visible only when focused. */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:start-4 focus:top-4 focus:z-50 focus:rounded-control focus:bg-neon focus:px-4 focus:py-2 focus:text-ink"
      >
        {locale === 'ar' ? 'تخطَّ إلى المحتوى' : 'Aller au contenu'}
      </a>

      <header className="sticky top-0 z-20 border-b border-ink-raised bg-ink/95 backdrop-blur">
        <div className="mx-auto flex max-w-content items-center gap-3 px-4 py-3">
          <button
            type="button"
            className="lg:hidden"
            aria-label={t.nav.menu}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <span className="block text-xl">☰</span>
          </button>

          <Link to={path('/')} aria-label="YAKOUB BIG BOSS">
            <Brand height={44} className="text-lg sm:text-xl" />
          </Link>

          <nav className="ms-8 hidden gap-6 lg:flex">
            {topLevel.map((c) => (
              <NavLink
                key={c.id}
                to={path(`/c/${c.slug}`)}
                className={({ isActive }) =>
                  `text-sm transition-colors duration-base ${isActive ? 'text-neon' : 'text-muted hover:text-white'}`
                }
              >
                {pick({ fr: c.name_fr, ar: c.name_ar })}
              </NavLink>
            ))}
          </nav>

          <div className="ms-auto flex items-center gap-3">
            <LanguageSwitch />
            <Link to={path('/cart')} className="relative text-sm text-muted hover:text-white">
              {t.nav.cart}
            </Link>
          </div>
        </div>

        {menuOpen && (
          <nav className="border-t border-ink-raised px-4 py-3 lg:hidden">
            <ul className="space-y-1">
              {topLevel.map((c) => (
                <li key={c.id}>
                  <Link
                    to={path(`/c/${c.slug}`)}
                    onClick={() => setMenuOpen(false)}
                    className="block py-2 text-muted hover:text-white"
                  >
                    {pick({ fr: c.name_fr, ar: c.name_ar })}
                  </Link>
                </li>
              ))}
              <li>
                <Link
                  to={path('/track')}
                  onClick={() => setMenuOpen(false)}
                  className="block py-2 text-muted hover:text-white"
                >
                  {t.nav.trackOrder}
                </Link>
              </li>
            </ul>
          </nav>
        )}
      </header>

      <div id="main">
        <Outlet />
      </div>

      <footer className="mt-20 border-t border-ink-raised">
        <div className="mx-auto max-w-content px-4 py-10">
          <Brand height={56} showWordmark className="text-lg" />
          <p className="mt-2 text-sm text-muted">
            {pick({
              fr: (settings?.['business.address_fr'] as string) ?? '',
              ar: (settings?.['business.address_ar'] as string) ?? '',
            })}
          </p>
          {phone && (
            <a href={`tel:${phone}`} className="mt-2 block text-sm text-muted" dir="ltr">
              {phone}
            </a>
          )}

          <ul className="mt-6 flex flex-wrap gap-4 text-sm text-muted">
            <li>
              <Link to={path('/p/return-policy')} className="hover:text-white">
                {locale === 'ar' ? 'سياسة الإرجاع' : 'Politique de retour'}
              </Link>
            </li>
            <li>
              <Link to={path('/p/privacy-policy')} className="hover:text-white">
                {locale === 'ar' ? 'سياسة الخصوصية' : 'Confidentialité'}
              </Link>
            </li>
            <li>
              <Link to={path('/p/terms-conditions')} className="hover:text-white">
                {locale === 'ar' ? 'الشروط والأحكام' : 'Conditions générales'}
              </Link>
            </li>
            <li>
              <Link to={path('/track')} className="hover:text-white">
                {t.nav.trackOrder}
              </Link>
            </li>
          </ul>

          {/* Staff entrance.
              Deliberately quiet: it belongs at the bottom of the footer, not in
              the header, because it is for two people and not for customers.
              Discoverable if you know to look, invisible if you do not — and it
              protects nothing on its own, since RLS is what guards the data. */}
          <div className="mt-8 border-t border-ink-raised pt-6">
            <Link
              to={path('/admin')}
              className="text-xs text-muted/50 transition-colors duration-base hover:text-neon"
            >
              {locale === 'ar' ? 'دخول الإدارة' : 'Espace Pro'}
            </Link>
          </div>
        </div>
      </footer>

      {/* Bottom bar: the order path stays one tap away at all times. */}
      <nav
        className="fixed inset-x-0 bottom-0 z-20 flex border-t border-ink-raised bg-ink-surface lg:hidden"
        aria-label={t.nav.menu}
      >
        <Link to={path('/')} className="flex-1 py-3 text-center text-xs text-muted">
          {t.nav.home}
        </Link>
        <Link to={path('/track')} className="flex-1 py-3 text-center text-xs text-muted">
          {t.nav.trackOrder}
        </Link>
        <Link to={path('/cart')} className="flex-1 py-3 text-center text-xs text-muted">
          {t.nav.cart}
        </Link>
        {waLink && (
          <a
            href={waLink}
            target="_blank"
            rel="noreferrer"
            className="flex-1 py-3 text-center text-xs text-success"
          >
            WhatsApp
          </a>
        )}
      </nav>
    </div>
  );
}
