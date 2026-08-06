import { useState } from 'react';
import { useI18n } from '@/i18n';
import { useDeliveryMethods, useDeliveryPrices, useWilayas } from '@/lib/queries/storefront';

/**
 * Delivery cost, shown on the product page BEFORE checkout (D-201).
 *
 * Not knowing the delivery cost until the last step is the single biggest
 * source of abandonment in Algerian COD. Answering it here, on the product
 * page, removes the reason to leave.
 *
 * Only wilayas are loaded — 58 rows. Communes are irrelevant to price in V1
 * (D-032) and loading 1,541 of them here would blow the JS budget for nothing.
 */
export function DeliveryEstimator() {
  const { t, price, pick, locale } = useI18n();
  const { data: wilayas } = useWilayas();
  const { data: methods } = useDeliveryMethods();
  const [wilayaId, setWilayaId] = useState<string | null>(null);
  const { data: prices, isLoading } = useDeliveryPrices(wilayaId);

  function priceFor(methodId: string): number | null {
    const row = prices?.find((p) => p.delivery_method_id === methodId && p.commune_id === null);
    return row ? row.price : null;
  }

  return (
    <div className="card p-4">
      <h3 className="text-sm font-medium">{t.delivery.estimate}</h3>

      <select
        className="field mt-3"
        value={wilayaId ?? ''}
        onChange={(e) => setWilayaId(e.target.value || null)}
        aria-label={t.delivery.chooseWilaya}
      >
        <option value="">{t.delivery.chooseWilaya}</option>
        {wilayas?.map((w) => (
          <option key={w.id} value={w.id}>
            {String(w.code).padStart(2, '0')} — {pick({ fr: w.name_fr, ar: w.name_ar })}
          </option>
        ))}
      </select>

      {wilayaId && (
        <div className="mt-3 space-y-1.5 text-sm">
          {isLoading ? (
            <p className="text-muted">{t.common.loading}…</p>
          ) : (
            methods?.map((m) => {
              const p = priceFor(m.id);
              return (
                <div key={m.id} className="flex items-center justify-between">
                  <span className="text-muted">{pick({ fr: m.label_fr, ar: m.label_ar })}</span>
                  <span className={p === null ? 'text-signal' : 'text-white'}>
                    {p === null
                      ? locale === 'ar'
                        ? 'غير متوفر'
                        : 'Non disponible'
                      : price(p)}
                  </span>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
