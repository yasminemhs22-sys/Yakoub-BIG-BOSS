import { useState, type FormEvent } from 'react';
import { useTrackOrder } from '@/lib/queries/checkout';
import { useI18n } from '@/i18n';

/**
 * Order tracking without an account (D-059).
 *
 * Requires BOTH the reference and the phone. Either alone would let anyone
 * enumerate other people's orders — which is why `track_order` is a
 * SECURITY DEFINER function rather than a table read, and why it returns only
 * status and dates, never the address.
 */
export default function TrackOrder() {
  const { t, price, pick, locale, date } = useI18n();
  const track = useTrackOrder();
  const [reference, setReference] = useState('');
  const [phone, setPhone] = useState('');
  const [notFound, setNotFound] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setNotFound(false);
    const result = await track.mutateAsync({ reference, phone });
    if (!result.ok) setNotFound(true);
  }

  const order = track.data?.ok ? track.data.order : null;

  return (
    <main className="mx-auto max-w-lg px-4 py-12">
      <h1 className="font-display text-display-sm">{t.orderStatus.trackTitle}</h1>
      <p className="mt-2 text-sm text-muted">{t.orderStatus.trackHint}</p>

      <form onSubmit={submit} className="mt-8 space-y-4">
        <div>
          <label htmlFor="ref" className="mb-1.5 block text-sm text-muted">
            {t.orderStatus.reference}
          </label>
          <input
            id="ref"
            className="field font-mono"
            dir="ltr"
            required
            placeholder="YBB-260802-XXXX"
            value={reference}
            onChange={(e) => setReference(e.target.value.toUpperCase())}
          />
        </div>

        <div>
          <label htmlFor="tphone" className="mb-1.5 block text-sm text-muted">
            {t.checkout.phone}
          </label>
          <input
            id="tphone"
            className="field"
            dir="ltr"
            inputMode="tel"
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>

        <button type="submit" className="btn-primary w-full" disabled={track.isPending}>
          {track.isPending ? t.common.loading : t.common.search}
        </button>
      </form>

      {notFound && (
        <p role="alert" className="mt-6 rounded-control bg-signal/10 p-3 text-sm text-signal">
          {t.orderStatus.trackNotFound}
        </p>
      )}

      {order && (
        <div className="card mt-8 space-y-3 p-5">
          <div className="flex items-center justify-between">
            <span className="font-mono text-sm" dir="ltr">
              {order.reference}
            </span>
            <span className="rounded bg-neon/15 px-3 py-1 text-sm text-neon">
              {locale === 'ar' ? order.label_ar : order.label_fr}
            </span>
          </div>

          <div className="flex justify-between text-sm">
            <span className="text-muted">
              {pick({ fr: 'Date', ar: 'التاريخ' })}
            </span>
            <span>{date(order.created_at)}</span>
          </div>

          <div className="flex justify-between text-sm">
            <span className="text-muted">{t.cart.total}</span>
            <span>{price(order.total)}</span>
          </div>

          {order.tracking_number && (
            <div className="flex justify-between text-sm">
              <span className="text-muted">
                {pick({ fr: 'Suivi transporteur', ar: 'رقم التتبع' })}
              </span>
              <span className="font-mono" dir="ltr">
                {order.tracking_number}
              </span>
            </div>
          )}

          {order.estimated_delivery_at && (
            <div className="flex justify-between text-sm">
              <span className="text-muted">
                {pick({ fr: 'Livraison estimée', ar: 'التسليم المتوقع' })}
              </span>
              <span>{date(order.estimated_delivery_at)}</span>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
