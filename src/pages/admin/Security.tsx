import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useI18n } from '@/i18n';
import { SkeletonText } from '@/components/Skeleton';

/**
 * Security audit panel.
 *
 * Phase 1 proved the RLS model with 218 assertions — but that was one moment in
 * time. A policy added later, in a hurry, to fix something urgent, could quietly
 * expose customer data and nobody would notice.
 *
 * This reads the `security_audit` view. Any row is a finding; anything marked
 * critical should block a release.
 */
function useSecurityAudit() {
  return useQuery({
    queryKey: ['security-audit'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('security_audit')
        .select('finding, object_name, detail, severity');
      if (error) throw error;
      return data as {
        finding: string;
        object_name: string;
        detail: string;
        severity: 'critical' | 'warning';
      }[];
    },
  });
}

function useSuspiciousPhones() {
  return useQuery({
    queryKey: ['suspicious-phones'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('suspicious_phones', { p_min_fake: 2 });
      if (error) throw error;
      return data as {
        phone_e164: string;
        fake_count: number;
        total_orders: number;
        is_blocked: boolean;
      }[];
    },
  });
}

export default function Security() {
  const { locale } = useI18n();
  const { data: findings, isLoading } = useSecurityAudit();
  const { data: suspicious } = useSuspiciousPhones();

  const critical = findings?.filter((f) => f.severity === 'critical') ?? [];
  const warnings = findings?.filter((f) => f.severity === 'warning') ?? [];

  return (
    <main className="p-4 lg:p-8">
      <h1 className="font-display text-display-sm">
        {locale === 'ar' ? 'الأمن' : 'Sécurité'}
      </h1>

      {isLoading ? (
        <div className="mt-8">
          <SkeletonText lines={4} />
        </div>
      ) : !findings?.length ? (
        <div className="mt-8 rounded-control bg-success/10 p-5">
          <p className="text-success">
            {locale === 'ar'
              ? 'لا توجد ملاحظات. سياسات الأمن سليمة.'
              : 'Aucune anomalie. Les politiques de sécurité sont conformes.'}
          </p>
        </div>
      ) : (
        <div className="mt-8 space-y-6">
          {critical.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm text-signal">
                {locale === 'ar' ? 'حرجة' : 'Critiques'} ({critical.length})
              </h2>
              <ul className="space-y-2">
                {critical.map((f, i) => (
                  <li key={i} className="rounded-control bg-signal/10 p-4">
                    <p className="font-mono text-sm text-signal" dir="ltr">
                      {f.object_name}
                    </p>
                    <p className="mt-1 text-sm text-metal">{f.detail}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {warnings.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm text-highlight">
                {locale === 'ar' ? 'تنبيهات' : 'Avertissements'} ({warnings.length})
              </h2>
              <ul className="space-y-2">
                {warnings.map((f, i) => (
                  <li key={i} className="rounded-control bg-highlight/10 p-4">
                    <p className="font-mono text-sm text-highlight" dir="ltr">
                      {f.object_name}
                    </p>
                    <p className="mt-1 text-sm text-metal">{f.detail}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      {suspicious && suspicious.length > 0 && (
        <section className="mt-12">
          <h2 className="mb-1 text-sm text-muted">
            {locale === 'ar' ? 'أرقام مشبوهة' : 'Numéros suspects'}
          </h2>
          <p className="mb-4 text-xs text-muted">
            {locale === 'ar'
              ? 'رقم بعدّة طلبات وهمية نمط لا صدفة.'
              : 'Plusieurs commandes frauduleuses depuis le même numéro.'}
          </p>
          <ul className="space-y-2">
            {suspicious.map((row) => (
              <li key={row.phone_e164} className="card flex flex-wrap items-center gap-3 p-4">
                <span className="font-mono text-sm" dir="ltr">
                  {row.phone_e164}
                </span>
                <span className="text-sm text-signal" dir="ltr">
                  {row.fake_count}/{row.total_orders}
                </span>
                {row.is_blocked && (
                  <span className="rounded bg-signal/15 px-2 py-0.5 text-xs text-signal">
                    {locale === 'ar' ? 'محظور' : 'Bloqué'}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
