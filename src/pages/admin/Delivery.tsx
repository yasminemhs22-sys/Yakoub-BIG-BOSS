import { useState } from 'react';
import {
  useBulkSetPrices,
  useSetDeliveryPrice,
  useWilayaPrices,
} from '@/lib/queries/delivery';
import { useI18n } from '@/i18n';
import { useAdminText } from '@/auth/useAdminText';
import { SkeletonText } from '@/components/Skeleton';

/**
 * Delivery prices — one row per wilaya, both methods, edited in place (D-119).
 *
 * A wilaya with no price cannot receive an order at all: `place_order` returns
 * `no_delivery_price` and the customer is turned away. So the missing count at
 * the top is the single most important number on this screen.
 *
 * Bulk fill exists because entering 58 wilayas one at a time is how a launch
 * slips by a week.
 */
export default function Delivery() {
  const { locale, price } = useI18n();
  const t = useAdminText();
  const { data, isLoading } = useWilayaPrices();
  const setPrice = useSetDeliveryPrice();
  const bulk = useBulkSetPrices();

  const [bulkBureau, setBulkBureau] = useState('');
  const [bulkDomicile, setBulkDomicile] = useState('');
  const [onlyMissing, setOnlyMissing] = useState(false);

  const missing = (data ?? []).filter((w) => w.bureau === null || w.domicile === null);
  const rows = onlyMissing ? missing : (data ?? []);

  if (isLoading) {
    return (
      <main className="p-4 lg:p-8">
        <SkeletonText lines={10} />
      </main>
    );
  }

  return (
    <main className="p-4 lg:p-8">
      <h1 className="font-display text-display-sm">{t.shell.delivery}</h1>

      {!data?.length ? (
        <div className="mt-8 rounded-control bg-highlight/10 p-5">
          <p className="text-highlight">
            {locale === 'ar'
              ? 'لا توجد ولايات في قاعدة البيانات بعد. شغّل بذور الجغرافيا أولاً.'
              : 'Aucune wilaya en base. Exécutez d’abord le seed géographique.'}
          </p>
        </div>
      ) : (
        <>
          <div
            className={`mt-6 rounded-control p-4 ${
              missing.length ? 'bg-signal/10' : 'bg-success/10'
            }`}
          >
            <p className={missing.length ? 'text-signal' : 'text-success'}>
              {missing.length
                ? locale === 'ar'
                  ? `${missing.length} ولاية بلا سعر — لا يمكن الطلب إليها.`
                  : `${missing.length} wilaya(s) sans tarif — aucune commande possible.`
                : locale === 'ar'
                  ? 'كل الولايات مسعّرة.'
                  : 'Toutes les wilayas sont tarifées.'}
            </p>
          </div>

          <section className="card mt-6 p-5">
            <h2 className="mb-3 text-sm text-muted">
              {locale === 'ar' ? 'تعبئة جماعية' : 'Remplissage groupé'}
            </h2>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="mb-1.5 block text-xs text-muted">{t.delivery?.bureau ?? 'Bureau'}</label>
                <input
                  className="field w-32"
                  type="number"
                  min={0}
                  dir="ltr"
                  value={bulkBureau}
                  onChange={(e) => setBulkBureau(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs text-muted">
                  {t.delivery?.domicile ?? 'À domicile'}
                </label>
                <input
                  className="field w-32"
                  type="number"
                  min={0}
                  dir="ltr"
                  value={bulkDomicile}
                  onChange={(e) => setBulkDomicile(e.target.value)}
                />
              </div>
              <button
                type="button"
                className="btn-secondary"
                disabled={bulk.isPending || (!bulkBureau && !bulkDomicile)}
                onClick={() =>
                  bulk.mutate({
                    wilayaIds: missing.map((w) => w.wilaya_id),
                    bureau: bulkBureau ? Number(bulkBureau) : null,
                    domicile: bulkDomicile ? Number(bulkDomicile) : null,
                  })
                }
              >
                {locale === 'ar'
                  ? `طبّق على الناقصة (${missing.length})`
                  : `Appliquer aux manquantes (${missing.length})`}
              </button>
              <button
                type="button"
                className="btn-secondary"
                disabled={bulk.isPending || (!bulkBureau && !bulkDomicile)}
                onClick={() =>
                  bulk.mutate({
                    wilayaIds: (data ?? []).map((w) => w.wilaya_id),
                    bureau: bulkBureau ? Number(bulkBureau) : null,
                    domicile: bulkDomicile ? Number(bulkDomicile) : null,
                  })
                }
              >
                {locale === 'ar' ? 'طبّق على الكل' : 'Appliquer à toutes'}
              </button>
            </div>
          </section>

          <label className="mt-6 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={onlyMissing}
              onChange={(e) => setOnlyMissing(e.target.checked)}
            />
            {locale === 'ar' ? 'الناقصة فقط' : 'Uniquement les manquantes'}
          </label>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-max text-sm">
              <thead>
                <tr className="text-start text-muted">
                  <th className="p-2 text-start">#</th>
                  <th className="p-2 text-start">{locale === 'ar' ? 'الولاية' : 'Wilaya'}</th>
                  <th className="p-2 text-start">Bureau</th>
                  <th className="p-2 text-start">À domicile</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((w) => (
                  <tr key={w.wilaya_id} className="border-t border-ink-raised">
                    <td className="p-2 font-mono text-xs text-muted" dir="ltr">
                      {String(w.code).padStart(2, '0')}
                    </td>
                    <td className="p-2">{locale === 'ar' ? w.name_ar : w.name_fr}</td>
                    <PriceCell wilayaId={w.wilaya_id} method="bureau" value={w.bureau} onSave={setPrice.mutate} />
                    <PriceCell wilayaId={w.wilaya_id} method="domicile" value={w.domicile} onSave={setPrice.mutate} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-6 text-xs text-muted">
            {locale === 'ar'
              ? `مثال على العرض: ${price(600)}`
              : `Exemple d’affichage : ${price(600)}`}
          </p>
        </>
      )}
    </main>
  );
}

/** Inline editing: leaving the field commits, so there is no save button to forget. */
function PriceCell({
  wilayaId,
  method,
  value,
  onSave,
}: {
  wilayaId: string;
  method: 'bureau' | 'domicile';
  value: number | null;
  onSave: (v: { wilayaId: string; methodCode: 'bureau' | 'domicile'; price: number | null }) => void;
}) {
  const [draft, setDraft] = useState(value === null ? '' : String(value));

  return (
    <td className="p-2">
      <input
        className={`field w-28 ${value === null ? 'border-signal/50' : ''}`}
        type="number"
        min={0}
        dir="ltr"
        placeholder="—"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const next = draft.trim() === '' ? null : Number(draft);
          if (next !== value) onSave({ wilayaId, methodCode: method, price: next });
        }}
      />
    </td>
  );
}
