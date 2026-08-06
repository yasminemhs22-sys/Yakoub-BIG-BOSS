import { useLocation, useNavigate } from 'react-router-dom';
import { useI18n } from '@/i18n';
import { LOCALES, persistLocale, type Locale } from '@/i18n/locale';

/**
 * Switching language keeps you on the same page (D-100).
 *
 * Bouncing to the homepage is the common shortcut and it is genuinely hostile:
 * someone reading a product in French who wants it in Arabic loses their place
 * and has to navigate back. Swapping the prefix is barely more code.
 */
export function LanguageSwitch({ className = '' }: { className?: string }) {
  const { locale, t } = useI18n();
  const navigate = useNavigate();
  const { pathname, search, hash } = useLocation();

  function switchTo(next: Locale) {
    if (next === locale) return;
    persistLocale(next);
    const rest = pathname.replace(/^\/(fr|ar)/, '');
    navigate(`/${next}${rest}${search}${hash}`, { replace: true });
  }

  return (
    <div
      className={`inline-flex items-center rounded-control border border-ink-raised ${className}`}
      role="group"
      aria-label={t.language.switch}
    >
      {LOCALES.map((code) => {
        const active = code === locale;
        return (
          <button
            key={code}
            type="button"
            onClick={() => switchTo(code)}
            aria-current={active ? 'true' : undefined}
            // lang on the button itself so a screen reader pronounces each
            // label in its own language rather than reading العربية in French.
            lang={code}
            className={[
              'px-3 py-1.5 text-sm font-medium transition-colors duration-base',
              'first:rounded-s-control last:rounded-e-control',
              active ? 'bg-neon text-ink' : 'text-muted hover:text-white',
            ].join(' ')}
          >
            {code === 'ar' ? 'ع' : 'FR'}
          </button>
        );
      })}
    </div>
  );
}
