import { NavLink, Outlet, Link } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';
import { useAdminText } from '@/auth/useAdminText';
import { useI18n } from '@/i18n';
import { LanguageSwitch } from '@/components/LanguageSwitch';
import { Brand } from '@/components/Brand';

/**
 * Dashboard chrome.
 *
 * Navigation is permission-driven, not role-driven: an entry appears only if
 * the signed-in admin holds the permission behind it. Hiring a content manager
 * therefore needs no code change (D-114).
 *
 * Layout is mobile-first on purpose. The owner will confirm orders by phone
 * while standing in the shop, so the dashboard has to work on a phone screen
 * (D-117) — hence the bottom bar on small screens and a sidebar only from `lg`.
 */
const NAV = [
  { to: 'orders', label: 'orders', permission: 'orders.view' },
  { to: 'catalogue', label: 'catalogue', permission: 'catalogue.manage' },
  { to: 'catalogue/taxonomy', label: 'taxonomy', permission: 'catalogue.manage' },
  { to: 'inventory', label: 'inventory', permission: 'inventory.manage' },
  { to: 'content', label: 'content', permission: 'content.manage' },
  { to: 'content/media', label: 'media', permission: 'content.manage' },
  { to: 'delivery', label: 'delivery', permission: 'delivery.manage' },
  { to: 'settings', label: 'settings', permission: 'settings.manage' },
  { to: 'access', label: 'access', permission: 'admins.manage' },
  { to: 'audit', label: 'audit', permission: 'audit.view' },
  { to: 'security', label: 'security', permission: 'audit.view' },
  { to: 'integrations', label: 'integrations', permission: 'orders.export' },
] as const;

export default function AdminShell() {
  const { profile, signOut, can } = useAuth();
  const t = useAdminText();
  const { path, locale } = useI18n();

  const visible = NAV.filter((item) => can(item.permission));

  return (
    <div className="min-h-dvh lg:flex">
      <aside className="hidden w-60 shrink-0 border-e border-ink-raised bg-ink-surface lg:block">
        <div className="p-5">
          <Link to={path('/admin')} aria-label="YAKOUB BIG BOSS">
            <Brand height={40} className="text-lg" />
          </Link>
          <p className="mt-1 text-xs text-muted">{t.shell.dashboard}</p>
        </div>

        <nav className="px-3">
          {visible.map((item) => (
            <NavLink
              key={item.to}
              to={path(`/admin/${item.to}`)}
              className={({ isActive }) =>
                [
                  'block rounded-control px-3 py-2 text-sm transition-colors duration-base',
                  isActive ? 'bg-neon/15 text-neon' : 'text-muted hover:text-white',
                ].join(' ')
              }
            >
              {t.shell[item.label]}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto space-y-3 p-5 text-sm">
          <div>
            <p className="text-xs text-muted">{t.shell.signedInAs}</p>
            <p className="text-white">{profile?.full_name}</p>
            <p className="text-xs text-muted">
              {locale === 'ar' ? profile?.role_name_ar : profile?.role_name_fr}
            </p>
          </div>
          <LanguageSwitch />
          <div className="flex flex-col gap-2">
            <Link to={path('/')} className="text-muted hover:text-white">
              {t.shell.viewShop}
            </Link>
            <button type="button" onClick={signOut} className="text-start text-signal hover:underline">
              {t.shell.signOut}
            </button>
          </div>
        </div>
      </aside>

      <div className="flex-1 pb-20 lg:pb-0">
        <header className="flex items-center justify-between border-b border-ink-raised px-4 py-3 lg:hidden">
          <Brand height={32} />
          <div className="flex items-center gap-3">
            <LanguageSwitch />
            <button type="button" onClick={signOut} className="text-sm text-signal">
              {t.shell.signOut}
            </button>
          </div>
        </header>

        <Outlet />
      </div>

      {/* Bottom bar on phones: the dashboard is used standing up, one-handed. */}
      <nav className="fixed inset-x-0 bottom-0 z-10 flex overflow-x-auto border-t border-ink-raised bg-ink-surface lg:hidden">
        {visible.slice(0, 5).map((item) => (
          <NavLink
            key={item.to}
            to={path(`/admin/${item.to}`)}
            className={({ isActive }) =>
              [
                'flex-1 whitespace-nowrap px-4 py-3 text-center text-xs',
                isActive ? 'text-neon' : 'text-muted',
              ].join(' ')
            }
          >
            {t.shell[item.label]}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
