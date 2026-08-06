import { Link } from 'react-router-dom';
import { useCart } from '@/lib/cart';
import { useResolvedCart } from '@/lib/queries/checkout';
import { imageUrl } from '@/lib/image';
import { useI18n } from '@/i18n';
import { SkeletonText } from '@/components/Skeleton';

export default function Cart() {
  const { t, price, pick, path } = useI18n();
  const cart = useCart();
  const { data: resolved, isLoading } = useResolvedCart(cart.lines);

  if (!cart.lines.length) {
    return (
      <main className="mx-auto max-w-content px-4 py-20 text-center">
        <p className="text-muted">{t.cart.empty}</p>
        <Link to={path('/')} className="btn-secondary mt-6">
          {t.cart.emptyAction}
        </Link>
      </main>
    );
  }

  if (isLoading) {
    return (
      <main className="mx-auto max-w-content px-4 py-10">
        <SkeletonText lines={6} />
      </main>
    );
  }

  const available = (resolved ?? []).filter((l) => !l.unavailable);
  const gone = (resolved ?? []).filter((l) => l.unavailable);
  const subtotal = available.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);

  return (
    <main className="mx-auto max-w-content px-4 py-10">
      <h1 className="font-display text-display-sm">{t.cart.title}</h1>

      {gone.length > 0 && (
        <div className="mt-6 rounded-control bg-signal/10 p-4 text-sm text-signal">
          <p>
            {pick({
              fr: 'Certains articles ne sont plus disponibles et ont été retirés.',
              ar: 'بعض المنتجات لم تعد متوفرة وتمّت إزالتها.',
            })}
          </p>
          <button
            type="button"
            className="mt-2 underline"
            onClick={() => gone.forEach((l) => cart.remove(l.variantId))}
          >
            {t.cart.remove}
          </button>
        </div>
      )}

      <ul className="mt-8 space-y-4">
        {available.map((line) => {
          const overStock = line.quantity > line.stock;
          return (
            <li key={line.variantId} className="card flex gap-4 p-4">
              <Link
                to={path(`/product/${line.productSlug}`)}
                className="h-24 w-20 shrink-0 overflow-hidden rounded"
              >
                {line.imagePath && (
                  <img
                    src={imageUrl(line.imagePath, { width: 160 })}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                )}
              </Link>

              <div className="min-w-0 flex-1">
                <Link to={path(`/product/${line.productSlug}`)} className="block truncate">
                  {pick({ fr: line.nameFr, ar: line.nameAr })}
                </Link>
                <p className="mt-1 text-sm text-muted">
                  {[pick({ fr: line.colorFr, ar: line.colorAr }), pick({ fr: line.sizeFr, ar: line.sizeAr })]
                    .filter(Boolean)
                    .join(' · ')}
                </p>

                {/* Stock is checked again at confirmation, but warning here
                    avoids a surprise phone call later. */}
                {overStock && (
                  <p className="mt-1 text-sm text-signal">
                    {line.stock === 0 ? t.product.outOfStock : `${t.product.inStock}: ${line.stock}`}
                  </p>
                )}

                <div className="mt-3 flex items-center gap-3">
                  <div className="flex items-center rounded-control border border-ink-raised">
                    <button
                      type="button"
                      aria-label="−"
                      className="px-3 py-1.5 text-muted hover:text-white"
                      onClick={() => cart.setQuantity(line.variantId, line.quantity - 1)}
                    >
                      −
                    </button>
                    <span className="min-w-8 text-center text-sm" dir="ltr">
                      {line.quantity}
                    </span>
                    <button
                      type="button"
                      aria-label="+"
                      className="px-3 py-1.5 text-muted hover:text-white"
                      onClick={() => cart.setQuantity(line.variantId, line.quantity + 1)}
                    >
                      +
                    </button>
                  </div>
                  <button
                    type="button"
                    className="text-sm text-signal hover:underline"
                    onClick={() => cart.remove(line.variantId)}
                  >
                    {t.cart.remove}
                  </button>
                </div>
              </div>

              <span className="shrink-0 text-sm">{price(line.unitPrice * line.quantity)}</span>
            </li>
          );
        })}
      </ul>

      <div className="card mt-8 space-y-2 p-5">
        <div className="flex justify-between text-sm">
          <span className="text-muted">{t.cart.subtotal}</span>
          <span>{price(subtotal)}</span>
        </div>
        <p className="text-xs text-muted">
          {pick({
            fr: 'Les frais de livraison sont calculés à l’étape suivante.',
            ar: 'تُحتسب رسوم التوصيل في الخطوة التالية.',
          })}
        </p>
        <Link
          to={path('/checkout')}
          className={`btn-primary mt-3 w-full ${available.length ? '' : 'pointer-events-none opacity-50'}`}
        >
          {t.cart.checkout}
        </Link>
      </div>
    </main>
  );
}
