import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useOrders, useOrderStatuses } from '@/lib/queries/orders';
import { StatusBadge } from '@/components/admin/StatusBadge';
import { useAdminText } from '@/auth/useAdminText';
import { useI18n } from '@/i18n';
import { SkeletonText } from '@/components/Skeleton';

export default function Orders() {
  const t = useAdminText();
  const { price, path, date, locale } = useI18n();
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const { data, isLoading } = useOrders({ status, search });
  const { data: statuses } = useOrderStatuses();

  return (
    <main className="p-4 lg:p-8">
      <h1 className="font-display text-display-sm">{t.shell.orders}</h1>

      <input
        className="field mt-6 max-w-sm"
        placeholder={t.orders.search}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        dir="ltr"
      />

      {/* Horizontal scroll: twelve statuses do not fit a phone screen. */}
      <div className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1">
        <button
          type="button"
          onClick={() => setStatus('all')}
          className={`shrink-0 rounded-control px-3 py-1.5 text-sm ${
            status === 'all' ? 'bg-neon text-ink' : 'bg-ink-surface text-muted'
          }`}
        >
          {t.orders.all}
        </button>
        {statuses?.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setStatus(s.code)}
            className={`shrink-0 rounded-control px-3 py-1.5 text-sm ${
              status === s.code ? 'bg-neon text-ink' : 'bg-ink-surface text-muted'
            }`}
          >
            {locale === 'ar' ? s.label_ar : s.label_fr}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="mt-8">
          <SkeletonText lines={8} />
        </div>
      ) : !data?.length ? (
        <p className="mt-12 text-center text-muted">{t.orders.empty}</p>
      ) : (
        <div className="mt-6 space-y-2">
          {data.map((o) => {
            const retryDue =
              o.next_retry_at && new Date(o.next_retry_at) <= new Date();
            return (
              <Link
                key={o.id}
                to={path(`/admin/orders/${o.id}`)}
                className="card block p-4 transition-colors duration-base hover:border-metal/30"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-mono text-sm text-metal" dir="ltr">
                    {o.reference}
                  </span>
                  <StatusBadge status={o.status} />
                  {retryDue && (
                    <span className="rounded bg-highlight/15 px-2 py-0.5 text-xs text-highlight">
                      {t.orders.retryDue}
                    </span>
                  )}
                  <span className="ms-auto text-sm">{price(o.total)}</span>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted">
                  <span>
                    {o.first_name} {o.last_name}
                  </span>
                  <span dir="ltr">{o.phone_e164}</span>
                  {o.wilaya && <span>{locale === 'ar' ? o.wilaya.name_ar : o.wilaya.name_fr}</span>}
                  <span className="ms-auto text-xs">{date(o.created_at)}</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
