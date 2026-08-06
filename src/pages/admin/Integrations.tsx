import { useFailedSyncs, useRequeueSync, useSyncHealth } from '@/lib/queries/integrations';
import { useI18n } from '@/i18n';
import { Skeleton } from '@/components/Skeleton';

/**
 * Google Sheets sync status.
 *
 * Sheets is a one-way reporting mirror (D-154). Edits made in the spreadsheet
 * never flow back — the database remains the source of truth, and this panel
 * exists so a broken mirror is visible rather than silent.
 */
export default function Integrations() {
  const { date, locale } = useI18n();
  const { data: health, isLoading } = useSyncHealth();
  const { data: failed } = useFailedSyncs();
  const requeue = useRequeueSync();

  const cards = [
    { key: 'pending', label: locale === 'ar' ? 'في الانتظار' : 'En attente', tone: 'text-muted' },
    { key: 'done', label: locale === 'ar' ? 'تمّت' : 'Synchronisées', tone: 'text-success' },
    { key: 'failed', label: locale === 'ar' ? 'فشلت' : 'Échouées', tone: 'text-signal' },
    {
      key: 'exhausted',
      label: locale === 'ar' ? 'توقفت المحاولات' : 'Abandonnées',
      tone: 'text-highlight',
    },
  ] as const;

  return (
    <main className="p-4 lg:p-8">
      <h1 className="font-display text-display-sm">Google Sheets</h1>
      <p className="mt-2 max-w-prose text-sm text-muted">
        {locale === 'ar'
          ? 'المزامنة في اتجاه واحد: قاعدة البيانات إلى الجدول. أي تعديل داخل الجدول لا يعود إلى النظام.'
          : 'Synchronisation à sens unique : base de données vers la feuille. Les modifications faites dans la feuille ne reviennent pas.'}
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c) => (
          <div key={c.key} className="card p-5">
            <p className="text-sm text-muted">{c.label}</p>
            {isLoading ? (
              <Skeleton className="mt-2 h-8 w-12" />
            ) : (
              <p className={`mt-2 text-3xl ${c.tone}`} dir="ltr">
                {health?.[c.key] ?? 0}
              </p>
            )}
          </div>
        ))}
      </div>

      {health?.last_synced_at && (
        <p className="mt-4 text-sm text-muted">
          {locale === 'ar' ? 'آخر مزامنة' : 'Dernière synchronisation'} :{' '}
          {date(health.last_synced_at)}
        </p>
      )}

      {health?.last_error && (
        <div className="mt-6 rounded-control bg-signal/10 p-4">
          <p className="text-sm text-signal">
            {locale === 'ar' ? 'آخر خطأ' : 'Dernière erreur'}
          </p>
          <p className="mt-1 font-mono text-xs text-metal" dir="ltr">
            {health.last_error}
          </p>
        </div>
      )}

      {failed && failed.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-sm text-muted">
            {locale === 'ar' ? 'طلبات لم تُزامَن' : 'Commandes non synchronisées'}
          </h2>
          <ul className="space-y-2">
            {failed.map((row) => (
              <li key={row.id} className="card flex flex-wrap items-center gap-3 p-4">
                <span className="font-mono text-sm text-metal" dir="ltr">
                  {row.orders?.reference ?? row.order_id.slice(0, 8)}
                </span>
                <span
                  className={`rounded px-2 py-0.5 text-xs ${
                    row.status === 'failed' ? 'bg-signal/15 text-signal' : 'bg-ink-raised text-muted'
                  }`}
                >
                  {row.status}
                </span>
                <span className="text-xs text-muted" dir="ltr">
                  {row.attempts}/5
                </span>
                {row.last_error && (
                  <span className="w-full truncate font-mono text-xs text-muted" dir="ltr">
                    {row.last_error}
                  </span>
                )}
                <button
                  type="button"
                  className="btn-secondary ms-auto px-3 py-1.5 text-sm"
                  disabled={requeue.isPending}
                  onClick={() => requeue.mutate(row.order_id)}
                >
                  {locale === 'ar' ? 'إعادة المزامنة' : 'Resynchroniser'}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
