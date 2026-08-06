import { Link } from 'react-router-dom';
import { useAdminText } from '@/auth/useAdminText';
import { useAuth } from '@/auth/AuthProvider';
import { useOrderCounts } from '@/lib/queries/orders';
import { useI18n } from '@/i18n';
import { Skeleton } from '@/components/Skeleton';

/**
 * Dashboard home.
 *
 * Action-oriented, not a wall of charts: what needs doing right now, in the
 * order it needs doing. Each card is a link into the filtered list, because
 * seeing "7 orders to confirm" is only useful if tapping it opens those seven.
 */
export default function Dashboard() {
  const t = useAdminText();
  const { profile, permissions, can } = useAuth();
  const { path } = useI18n();
  const { data: counts, isLoading } = useOrderCounts();

  const cards = [
    { code: 'new', label: t.home.awaitingConfirmation, tone: 'text-neon' },
    { code: 'pending_confirmation', label: t.orders.all, tone: 'text-muted' },
    { code: 'unreachable', label: t.home.unreachable, tone: 'text-highlight' },
    { code: 'confirmed', label: t.shell.orders, tone: 'text-success' },
  ];

  return (
    <main className="p-4 lg:p-8">
      <h1 className="font-display text-display-sm">{t.shell.dashboard}</h1>
      <p className="mt-1 text-sm text-muted">{profile?.full_name}</p>

      {can('orders.view') && (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map((card) => (
            <Link key={card.code} to={`${path('/admin/orders')}`} className="card p-5">
              <p className="text-sm text-muted">{card.label}</p>
              {isLoading ? (
                <Skeleton className="mt-2 h-8 w-12" />
              ) : (
                <p className={`mt-2 text-3xl ${card.tone}`} dir="ltr">
                  {counts?.[card.code] ?? 0}
                </p>
              )}
            </Link>
          ))}
        </div>
      )}

      {/* Temporary: proves permissions resolve end to end. Removed at launch. */}
      <details className="card mt-8 p-5 text-sm">
        <summary className="cursor-pointer text-muted">
          Permissions ({permissions.length})
        </summary>
        <ul className="mt-3 grid gap-1 sm:grid-cols-2" dir="ltr">
          {permissions.map((p) => (
            <li key={p} className="font-mono text-xs text-metal">
              {p}
            </li>
          ))}
        </ul>
      </details>
    </main>
  );
}
