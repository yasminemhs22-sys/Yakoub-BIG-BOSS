import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '@/lib/cart';
import { useResolvedCart, useResolvedDeliveryFee, usePlaceOrder } from '@/lib/queries/checkout';
import { useCommunes, useDeliveryMethods, useWilayas } from '@/lib/queries/storefront';
import { useI18n } from '@/i18n';
import { SkeletonText } from '@/components/Skeleton';

/**
 * Checkout.
 *
 * Six fields plus a conditional address (D-240). Nothing else — every extra
 * field on a cash-on-delivery form costs orders, and this form is the entire
 * revenue path.
 *
 * No figure here is trusted from the client: the delivery fee comes from the
 * same database function the server uses, and the final total is recomputed
 * inside place_order() regardless of what this page displayed (D-274).
 */
export default function Checkout() {
  const { t, price, pick, path, locale } = useI18n();
  const navigate = useNavigate();
  const cart = useCart();
  const { data: resolved, isLoading } = useResolvedCart(cart.lines);
  const { data: wilayas } = useWilayas();
  const { data: methods } = useDeliveryMethods();
  const placeOrder = usePlaceOrder();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [wilayaId, setWilayaId] = useState('');
  const [communeId, setCommuneId] = useState('');
  const [methodId, setMethodId] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data: communes } = useCommunes(wilayaId || null);
  const fee = useResolvedDeliveryFee(wilayaId || null, communeId || null, methodId || null);

  // Changing wilaya invalidates the commune: a commune must belong to its
  // wilaya, and the database enforces that on insert.
  useEffect(() => setCommuneId(''), [wilayaId]);

  const available = useMemo(() => (resolved ?? []).filter((l) => !l.unavailable), [resolved]);
  const subtotal = available.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);
  const deliveryFee = fee.data ?? null;
  const total = deliveryFee === null ? null : subtotal + deliveryFee;

  const selectedMethod = methods?.find((m) => m.id === methodId);
  const addressRequired = selectedMethod?.code === 'domicile';

  const REASONS: Record<string, string> = {
    invalid_phone: t.errors.invalidPhone,
    rate_limited: t.errors.rateLimited,
    duplicate_submission: t.errors.duplicate,
    no_delivery_price: t.errors.noDeliveryPrice,
    invalid_cart: t.cart.empty,
    rejected: t.errors.generic,
    address_required: t.errors.addressRequired,
    invalid_destination: t.errors.generic,
    variant_unavailable: t.errors.generic,
    generic: t.errors.generic,
  };

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (addressRequired && address.trim().length < 5) {
      setError(t.errors.addressRequired);
      return;
    }

    try {
      const result = await placeOrder.mutateAsync({
        firstName,
        lastName,
        phone,
        wilayaId,
        communeId,
        methodId,
        address: address.trim() || undefined,
        notes: notes.trim() || undefined,
        items: available.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
        honeypot,
      });

      if (!result.ok) {
        setError(REASONS[result.reason] ?? t.errors.generic);
        return;
      }

      cart.clear();
      navigate(`${path('/order')}/${result.reference}`, { replace: true });
    } catch (e) {
      // Server-side validation failures (commune/wilaya mismatch, missing
      // address) arrive as exceptions rather than a result object.
      const message = e instanceof Error ? e.message : '';
      if (message.includes('Address is required')) setError(t.errors.addressRequired);
      else if (message.includes('Commune')) setError(t.errors.generic);
      else setError(t.errors.generic);
    }
  }

  if (isLoading) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-10">
        <SkeletonText lines={8} />
      </main>
    );
  }

  if (!available.length) {
    return (
      <main className="mx-auto max-w-content px-4 py-20 text-center">
        <p className="text-muted">{t.cart.empty}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="font-display text-display-sm">{t.checkout.title}</h1>
      <p className="mt-2 text-sm text-success">{t.checkout.payOnDelivery}</p>

      <form onSubmit={submit} className="mt-8 space-y-4" noValidate>
        {/* Honeypot: hidden from people, filled by bots. A filled value returns
            a fake success so the bot learns nothing (see place_order). */}
        <input
          type="text"
          name="company"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          value={honeypot}
          onChange={(e) => setHoneypot(e.target.value)}
          style={{ position: 'absolute', left: '-9999px', opacity: 0 }}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="firstName" className="mb-1.5 block text-sm text-muted">
              {t.checkout.firstName}
            </label>
            <input
              id="firstName"
              className="field"
              required
              minLength={2}
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              autoComplete="given-name"
            />
          </div>
          <div>
            <label htmlFor="lastName" className="mb-1.5 block text-sm text-muted">
              {t.checkout.lastName}
            </label>
            <input
              id="lastName"
              className="field"
              required
              minLength={2}
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              autoComplete="family-name"
            />
          </div>
        </div>

        <div>
          <label htmlFor="phone" className="mb-1.5 block text-sm text-muted">
            {t.checkout.phone}
          </label>
          <input
            id="phone"
            className="field"
            required
            dir="ltr"
            inputMode="tel"
            placeholder="0563876210"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            autoComplete="tel"
          />
          <p className="mt-1 text-xs text-muted">
            {pick({
              fr: 'Nous vous appelons pour confirmer la commande.',
              ar: 'سنتصل بك لتأكيد الطلب.',
            })}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="wilaya" className="mb-1.5 block text-sm text-muted">
              {t.delivery.chooseWilaya}
            </label>
            <select
              id="wilaya"
              className="field"
              required
              value={wilayaId}
              onChange={(e) => setWilayaId(e.target.value)}
            >
              <option value="">—</option>
              {wilayas?.map((w) => (
                <option key={w.id} value={w.id}>
                  {String(w.code).padStart(2, '0')} — {pick({ fr: w.name_fr, ar: w.name_ar })}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="commune" className="mb-1.5 block text-sm text-muted">
              {t.delivery.chooseCommune}
            </label>
            <select
              id="commune"
              className="field"
              required
              disabled={!wilayaId}
              value={communeId}
              onChange={(e) => setCommuneId(e.target.value)}
            >
              <option value="">—</option>
              {communes?.map((c) => (
                <option key={c.id} value={c.id}>
                  {pick({ fr: c.name_fr, ar: c.name_ar })}
                </option>
              ))}
            </select>
          </div>
        </div>

        <fieldset>
          <legend className="mb-2 text-sm text-muted">{t.delivery.estimate}</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {methods?.map((m) => (
              <label
                key={m.id}
                className={`flex cursor-pointer items-center gap-3 rounded-control border p-3 ${
                  methodId === m.id ? 'border-neon' : 'border-ink-raised'
                }`}
              >
                <input
                  type="radio"
                  name="method"
                  value={m.id}
                  checked={methodId === m.id}
                  onChange={() => setMethodId(m.id)}
                  required
                />
                <span>{pick({ fr: m.label_fr, ar: m.label_ar })}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {addressRequired && (
          <div>
            <label htmlFor="address" className="mb-1.5 block text-sm text-muted">
              {t.checkout.address}
            </label>
            <textarea
              id="address"
              className="field"
              rows={3}
              required
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              autoComplete="street-address"
            />
          </div>
        )}

        <div>
          <label htmlFor="notes" className="mb-1.5 block text-sm text-muted">
            {t.checkout.notes}{' '}
            <span className="text-muted/60">({t.checkout.notesHint})</span>
          </label>
          <textarea
            id="notes"
            className="field"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        <div className="card space-y-2 p-5">
          <div className="flex justify-between text-sm">
            <span className="text-muted">{t.cart.subtotal}</span>
            <span>{price(subtotal)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted">{t.cart.deliveryFee}</span>
            <span>
              {deliveryFee === null ? (
                <span className="text-muted">—</span>
              ) : (
                price(deliveryFee)
              )}
            </span>
          </div>
          <div className="flex justify-between border-t border-ink-raised pt-2 text-lg">
            <span>{t.cart.total}</span>
            <span className="text-neon">{total === null ? '—' : price(total)}</span>
          </div>
        </div>

        {error && (
          <p role="alert" className="rounded-control bg-signal/10 p-3 text-sm text-signal">
            {error}
          </p>
        )}

        <button
          type="submit"
          className="btn-primary w-full"
          disabled={placeOrder.isPending || total === null}
        >
          {placeOrder.isPending
            ? locale === 'ar'
              ? 'جاري الإرسال…'
              : 'Envoi…'
            : t.checkout.submit}
        </button>
      </form>
    </main>
  );
}
