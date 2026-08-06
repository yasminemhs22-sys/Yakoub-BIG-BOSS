import { useI18n } from '@/i18n';
import type { OrderDetail } from '@/lib/queries/orders';

const EVENT_LABEL: Record<string, { fr: string; ar: string }> = {
  order_placed: { fr: 'Commande passée', ar: 'تم تسجيل الطلب' },
  status_changed: { fr: 'Statut modifié', ar: 'تغيّرت الحالة' },
  call_attempt: { fr: 'Appel', ar: 'اتصال' },
  note_added: { fr: 'Note', ar: 'ملاحظة' },
  shipping_updated: { fr: 'Expédition', ar: 'الشحن' },
  fee_overridden: { fr: 'Frais modifiés', ar: 'تعديل الرسوم' },
  oversell_override: { fr: 'Vente à découvert', ar: 'تجاوز المخزون' },
};

/**
 * The order timeline: who, when, and an optional note (D-055).
 *
 * Append-only in the database — a database trigger refuses UPDATE and DELETE.
 * Nothing here can edit history, and nothing should: this is the record of a
 * manual, phone-driven process where "who confirmed this" is a real question.
 */
export function OrderTimeline({ timeline }: { timeline: OrderDetail['timeline'] }) {
  const { locale, date } = useI18n();

  if (!timeline.length) return null;

  return (
    <ol className="space-y-4">
      {timeline.map((entry) => {
        const label = EVENT_LABEL[entry.event_type];
        const to = entry.to_status
          ? locale === 'ar'
            ? entry.to_status.label_ar
            : entry.to_status.label_fr
          : null;

        return (
          <li key={entry.id} className="border-s-2 border-ink-raised ps-4">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-sm text-white">
                {label ? (locale === 'ar' ? label.ar : label.fr) : entry.event_type}
              </span>
              {to && <span className="text-sm text-neon">→ {to}</span>}
              <span className="ms-auto text-xs text-muted" dir="ltr">
                {date(entry.created_at)}{' '}
                {new Date(entry.created_at).toLocaleTimeString(
                  locale === 'ar' ? 'ar-DZ-u-nu-latn' : 'fr-DZ',
                  { hour: '2-digit', minute: '2-digit' },
                )}
              </span>
            </div>

            {entry.actor && (
              <p className="mt-0.5 text-xs text-muted">{entry.actor.full_name}</p>
            )}
            {entry.note && <p className="mt-1 text-sm text-metal">{entry.note}</p>}
          </li>
        );
      })}
    </ol>
  );
}
