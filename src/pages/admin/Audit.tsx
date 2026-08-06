import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useI18n } from '@/i18n';
import { useAdminText } from '@/auth/useAdminText';
import { SkeletonText } from '@/components/Skeleton';

/**
 * Audit log.
 *
 * With several people handling orders and real money, "who changed this price"
 * and "who confirmed that order" are questions that eventually get asked. The
 * log is append-only and written by database triggers, so nothing in the
 * application can edit or erase it.
 */
export default function Audit() {
  const { locale, date } = useI18n();
  const t = useAdminText();
  const [table, setTable] = useState('all');

  const { data, isLoading } = useQuery({
    queryKey: ['audit', table],
    queryFn: async () => {
      let q = supabase
        .from('audit_log')
        .select('id, actor_id, action, entity_table, entity_id, created_at')
        .order('created_at', { ascending: false })
        .limit(200);
      if (table !== 'all') q = q.eq('entity_table', table);
      const { data, error } = await q;
      if (error) throw error;
      return data as {
        id: number;
        actor_id: string | null;
        action: string;
        entity_table: string;
        entity_id: string | null;
        created_at: string;
      }[];
    },
  });

  const { data: admins } = useQuery({
    queryKey: ['admin-names'],
    queryFn: async () => {
      const { data } = await supabase.from('admin_users').select('id, full_name');
      return Object.fromEntries(
        ((data ?? []) as { id: string; full_name: string }[]).map((a) => [a.id, a.full_name]),
      );
    },
  });

  const TABLES = [
    'all',
    'orders',
    'products',
    'product_variants',
    'delivery_prices',
    'settings',
    'admin_users',
    'categories',
  ];

  const ACTION_COLOR: Record<string, string> = {
    insert: 'text-success',
    update: 'text-highlight',
    delete: 'text-signal',
  };

  return (
    <main className="p-4 lg:p-8">
      <h1 className="font-display text-display-sm">{t.shell.audit}</h1>

      <div className="-mx-4 mt-6 flex gap-2 overflow-x-auto px-4 pb-1">
        {TABLES.map((tbl) => (
          <button
            key={tbl}
            type="button"
            onClick={() => setTable(tbl)}
            className={`shrink-0 rounded-control px-3 py-1.5 text-sm ${
              table === tbl ? 'bg-neon text-ink' : 'bg-ink-surface text-muted'
            }`}
          >
            {tbl === 'all' ? (locale === 'ar' ? 'الكل' : 'Tout') : tbl}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="mt-8">
          <SkeletonText lines={8} />
        </div>
      ) : !data?.length ? (
        <p className="mt-12 text-center text-muted">
          {locale === 'ar' ? 'لا توجد سجلات.' : 'Aucune entrée.'}
        </p>
      ) : (
        <ul className="mt-6 space-y-1">
          {data.map((entry) => (
            <li
              key={entry.id}
              className="flex flex-wrap items-center gap-3 border-b border-ink-raised py-2 text-sm"
            >
              <span className={ACTION_COLOR[entry.action] ?? 'text-muted'}>{entry.action}</span>
              <span className="font-mono text-xs text-metal" dir="ltr">
                {entry.entity_table}
              </span>
              <span className="text-muted">
                {entry.actor_id ? (admins?.[entry.actor_id] ?? '—') : '—'}
              </span>
              <span className="ms-auto text-xs text-muted" dir="ltr">
                {date(entry.created_at)}{' '}
                {new Date(entry.created_at).toLocaleTimeString(
                  locale === 'ar' ? 'ar-DZ-u-nu-latn' : 'fr-DZ',
                  { hour: '2-digit', minute: '2-digit' },
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
