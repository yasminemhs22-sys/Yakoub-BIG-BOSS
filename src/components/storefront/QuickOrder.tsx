import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '@/i18n';
import { useCommunes, useDeliveryMethods, useWilayas } from '@/lib/queries/storefront';
import { usePlaceOrder, useResolvedDeliveryFee } from '@/lib/queries/checkout';

/**
 * Quick order — one product, one screen.
 *
 * The cart still exists for customers buying several items, but most orders
 * here are a single piece, and sending someone through cart → checkout for one
 * t-shirt loses orders that a form on the page itself would have captured.
 * This is the pattern Algerian cash-on-delivery shops use, for that reason.
 *
 * Same rules as the full checkout: the browser sends variant id and quantity
 * only, and every figure — delivery fee, total — is resolved by the database
 * (D-273, D-274). Nothing about the shorter path relaxes that.
 */
export function QuickOrder({
  variantId,
  unitPrice,
  disabled,
  onClose,
}: {
  variantId: string | null;
  unitPrice: number;
  disabled: boolean;
  onClose: () => void;
}) {
  const { t, price, pick, path, locale } = useI18n();
  const navigate = useNavigate();
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
  const [quantity, setQuantity] = useState(1);
  const [honeypot, setHoneypot] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data: communes } = useCommunes(wilayaId || null);
  const fee = useResolvedDeliveryFee(wilayaId || null, communeId || null, methodId || null);

  // A commune must belong to its wilaya; the database enforces it, so clear the
  // stale choice rather than let the customer hit a rejection.
  useEffect(() => setCommuneId(''), [wilayaId]);

  const selectedMethod = methods?.find((m) => m.id === methodId);
  const addressRequired = selectedMethod?.code === 'domicile';
  const deliveryFee = fee.data ?? null;
  const subtotal = unitPrice * quantity;
  const total = deliveryFee === null ? null : subtotal + deliveryFee;

  const REASONS: Record<string, string> = {
    invalid_phone: t.errors.invalidPhone,
    rate_limited: t.errors.rateLimited,
    duplicate_submission: t.errors.duplicate,
    no_delivery_price: t.errors.noDeliveryPrice,
    invalid_cart: t.errors.generic,
    rejected: t.errors.generic,
    address_required: t.errors.addressRequired,
    invalid_destination: t.errors.generic,
    variant_unavailable: t.product.outOfStock,
    generic: t.errors.generic,
  };

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (!variantId) {
      setError(pick({ fr: 'Choisissez la couleur et la taille.', ar: 'اختر اللون والمقاس.' }));
      return;
    }
    if (addressRequired && address.trim().length < 5) {
      setError(t.errors.addressRequired);
      return;
    }

    const result = await placeOrder.mutateAsync({
  firstName,
  lastName,
  phone,
  wilayaId,
  communeId,
  methodId,
  address: address.trim() || undefined,
  items: [{ variantId, quantity }],
  honeypot,
});

    if (!result.ok) {
      setError(REASONS[result.reason] ?? t.errors.generic);
      return;
    }
    navigate(`${path('/order')}/${result.reference}`, { replace: true });
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/80 sm:items-center">
      <div className="card max-h-[92dvh] w-full max-w-lg overflow-y-auto p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-xl">{t.checkout.title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.common.close}
            className="text-2xl leading-none text-muted hover:text-white"
          >
            ×
          </button>
        </div>

        <p className="mb-4 text-sm text-success">{t.checkout.payOnDelivery}</p>

        <form onSubmit={submit} className="space-y-3" noValidate>
          {/* Hidden from people, filled by bots. */}
          <input
            type="text"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            value={honeypot}
            onChange={(e) => setHoneypot(e.target.value)}
            style={{ position: 'absolute', left: '-9999px', opacity: 0 }}
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <input
              className="field"
              placeholder={t.checkout.firstName}
              required
              minLength={2}
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              autoComplete="given-name"
            />
            <input
              className="field"
              placeholder={t.checkout.lastName}
              required
              minLength={2}
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              autoComplete="family-name"
            />
          </div>

          <input
            className="field"
            placeholder={t.checkout.phone}
            required
            dir="ltr"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            autoComplete="tel"
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <select
              className="field"
              required
              value={wilayaId}
              onChange={(e) => setWilayaId(e.target.value)}
              aria-label={t.delivery.chooseWilaya}
            >
              <option value="">{t.delivery.chooseWilaya}</option>
              {wilayas?.map((w) => (
                <option key={w.id} value={w.id}>
                  {String(w.code).padStart(2, '0')} — {pick({ fr: w.name_fr, ar: w.name_ar })}
                </option>
              ))}
            </select>

            <select
              className="field"
              required
              disabled={!wilayaId}
              value={communeId}
              onChange={(e) => setCommuneId(e.target.value)}
              aria-label={t.delivery.chooseCommune}
            >
              <option value="">{t.delivery.chooseCommune}</option>
              {communes?.map((c) => (
                <option key={c.id} value={c.id}>
                  {pick({ fr: c.name_fr, ar: c.name_ar })}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {methods?.map((m) => (
              <label
                key={m.id}
                className={`flex cursor-pointer items-center gap-3 rounded-control border p-3 text-sm ${
                  methodId === m.id ? 'border-neon' : 'border-ink-raised'
                }`}
              >
                <input
                  type="radio"
                  name="qo-method"
                  checked={methodId === m.id}
                  onChange={() => setMethodId(m.id)}
                  required
                />
                {pick({ fr: m.label_fr, ar: m.label_ar })}
              </label>
            ))}
          </div>

          {addressRequired && (
            <textarea
              className="field"
              rows={2}
              placeholder={t.checkout.address}
              required
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              autoComplete="street-address"
            />
          )}

          <div className="flex items-center gap-3">
            <span className="text-sm text-muted">{t.cart.quantity}</span>
            <div className="flex items-center rounded-control border border-ink-raised">
              <button
                type="button"
                aria-label="−"
                className="px-3 py-1.5 text-muted hover:text-white"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              >
                −
              </button>
              <span className="min-w-8 text-center text-sm" dir="ltr">
                {quantity}
              </span>
              <button
                type="button"
                aria-label="+"
                className="px-3 py-1.5 text-muted hover:text-white"
                onClick={() => setQuantity((q) => Math.min(20, q + 1))}
              >
                +
              </button>
            </div>
          </div>

          <div className="space-y-1 rounded-control bg-ink-raised p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted">{t.cart.subtotal}</span>
              <span>{price(subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">{t.cart.deliveryFee}</span>
              <span>{deliveryFee === null ? '—' : price(deliveryFee)}</span>
            </div>
            <div className="flex justify-between border-t border-ink pt-1 text-base">
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
            disabled={placeOrder.isPending || disabled || total === null}
          >
            {placeOrder.isPending
              ? locale === 'ar'
                ? 'جاري الإرسال…'
                : 'Envoi…'
              : t.checkout.submit}
          </button>
        </form>
      </div>
    </div>
  );
}
