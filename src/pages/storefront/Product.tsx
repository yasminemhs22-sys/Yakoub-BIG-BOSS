import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useProductDetail } from '@/lib/queries/storefront';
import { useSettings } from '@/lib/queries/settings';
import { imageSrcSet, imageUrl, SIZES } from '@/lib/image';
import { useSeo, useJsonLd, productJsonLd } from '@/lib/seo';
import { SITE_URL } from '@/lib/env';
import { DeliveryEstimator } from '@/components/storefront/DeliveryEstimator';
import { QuickOrder } from '@/components/storefront/QuickOrder';
import { Skeleton } from '@/components/Skeleton';
import { useI18n, interpolate } from '@/i18n';
import { useCart } from '@/lib/cart';

export default function Product() {
  const { slug } = useParams();
  const { t, price, pick, locale } = useI18n();
  const { data, isLoading } = useProductDetail(slug);
  const { data: settings } = useSettings();
  const cart = useCart();

  const [colorId, setColorId] = useState<string | null>(null);
  const [sizeId, setSizeId] = useState<string | null>(null);
  const [imageIndex, setImageIndex] = useState(0);
  const [added, setAdded] = useState(false);
  const [ordering, setOrdering] = useState(false);

  const threshold = Number(settings?.['inventory.display_threshold'] ?? 10);

  /**
   * The selected variant.
   *
   * Colour and size are nullable, so a One Size product with a single colour
   * resolves immediately without the customer choosing anything.
   */
  const variant = useMemo(() => {
    if (!data) return null;
    if (data.variants.length === 1) return data.variants[0]!;
    return (
      data.variants.find(
        (v) => (v.color_id ?? null) === colorId && (v.size_id ?? null) === sizeId,
      ) ?? null
    );
  }, [data, colorId, sizeId]);

  /** Which sizes exist for the chosen colour — used to disable, never hide. */
  const availableSizeIds = useMemo(() => {
    if (!data) return new Set<string>();
    return new Set(
      data.variants
        .filter((v) => !colorId || v.color_id === colorId)
        .map((v) => v.size_id)
        .filter(Boolean) as string[],
    );
  }, [data, colorId]);

  const seoName = data ? pick({ fr: data.name_fr, ar: data.name_ar }) : '';
  const seoImage = data?.media[0] ? imageUrl(data.media[0].storage_path, { width: 1200 }) : null;

  // Hooks must run on every render, so SEO is applied before the early returns
  // below. Empty values while loading are harmless — crawlers are served by the
  // edge function, not by this.
  useSeo({
    title: data
      ? pick({ fr: data.meta_title_fr, ar: data.meta_title_ar }) || `${seoName} · YAKOUB BIG BOSS`
      : 'YAKOUB BIG BOSS',
    description: data
      ? pick({ fr: data.meta_description_fr, ar: data.meta_description_ar }) ||
        pick({ fr: data.description_fr, ar: data.description_ar })?.slice(0, 160)
      : null,
    path: `/product/${slug ?? ''}`,
    locale,
    image: seoImage,
    hasArabic: Boolean(data?.name_ar?.trim()),
    type: 'product',
  });

  useJsonLd(
    'product',
    data
      ? productJsonLd({
          name: seoName,
          description: pick({ fr: data.description_fr, ar: data.description_ar }) || null,
          image: seoImage,
          sku: data.variants[0]?.sku ?? null,
          price: data.sale_price ?? data.original_price,
          inStock: data.variants.some((v) => v.stock_on_hand > 0),
          url: `${SITE_URL}/${locale}/product/${data.slug}`,
        })
      : null,
  );

  if (isLoading) {
    return (
      <main className="mx-auto max-w-content px-4 py-10">
        <div className="grid gap-8 lg:grid-cols-2">
          <Skeleton className="aspect-square" />
          <div className="space-y-4">
            <Skeleton className="h-10 w-2/3" />
            <Skeleton className="h-6 w-1/3" />
            <Skeleton className="h-32 w-full" />
          </div>
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="mx-auto max-w-content px-4 py-20 text-center">
        <p className="text-muted">{t.errors.notFound}</p>
      </main>
    );
  }

  const name = pick({ fr: data.name_fr, ar: data.name_ar });
  const base = data.sale_price ?? data.original_price;
  const unit = base + (variant?.price_adjustment ?? 0);
  const stock = variant?.stock_on_hand ?? 0;
  const inStock = variant ? stock > 0 : data.variants.some((v) => v.stock_on_hand > 0);

  const whatsapp = (settings?.['business.whatsapp'] as string) ?? '';
  const waLink = whatsapp
    ? `https://wa.me/213${whatsapp.replace(/^0/, '').replace(/\D/g, '')}?text=${encodeURIComponent(
        `${name}${variant ? ` (${variant.sku})` : ''}`,
      )}`
    : null;

  return (
    <main className="mx-auto max-w-content px-4 py-8 pb-28 lg:pb-8">
      <div className="grid gap-10 lg:grid-cols-2">
        <div>
          <div className="aspect-square overflow-hidden rounded-card bg-ink-surface">
            {data.media[imageIndex] && (
              <img
                src={imageUrl(data.media[imageIndex]!.storage_path, { width: 800 })}
                srcSet={imageSrcSet(data.media[imageIndex]!.storage_path, [480, 640, 800, 1200])}
                sizes={SIZES.productHero}
                alt={pick({
                  fr: data.media[imageIndex]!.alt_fr,
                  ar: data.media[imageIndex]!.alt_ar,
                }) || name}
                className="h-full w-full object-cover"
              />
            )}
          </div>
          {data.media.length > 1 && (
            <div className="mt-3 flex gap-2 overflow-x-auto">
              {data.media.map((m, i) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setImageIndex(i)}
                  aria-label={`Image ${i + 1}`}
                  className={`h-16 w-16 shrink-0 overflow-hidden rounded border-2 ${
                    i === imageIndex ? 'border-neon' : 'border-transparent'
                  }`}
                >
                  <img
                    src={imageUrl(m.storage_path, { width: 128 })}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <h1
            className={
              locale === 'ar' ? 'font-display text-ar-display-sm' : 'font-display text-display-sm'
            }
          >
            {name}
          </h1>

          <p className="mt-3 text-2xl">
            {data.sale_price != null ? (
              <>
                <span className="text-neon">{price(unit)}</span>{' '}
                <span className="text-base text-muted line-through">{price(data.original_price)}</span>
              </>
            ) : (
              price(unit)
            )}
          </p>

          {data.colors.length > 0 && (
            <div className="mt-6">
              <p className="mb-2 text-sm text-muted">{t.product.chooseColor}</p>
              <div className="flex flex-wrap gap-2">
                {data.colors.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setColorId(colorId === c.id ? null : c.id)}
                    aria-pressed={colorId === c.id}
                    title={pick({ fr: c.name_fr, ar: c.name_ar })}
                    className={`h-10 w-10 rounded-full border-2 transition-colors duration-fast ${
                      colorId === c.id ? 'border-neon' : 'border-ink-raised'
                    }`}
                    style={{ backgroundColor: c.hex_value }}
                  />
                ))}
              </div>
            </div>
          )}

          {data.sizes.length > 0 && (
            <div className="mt-6">
              <p className="mb-2 text-sm text-muted">{t.product.chooseSize}</p>
              <div className="flex flex-wrap gap-2">
                {data.sizes.map((s) => {
                  const exists = availableSizeIds.has(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      disabled={!exists}
                      onClick={() => setSizeId(sizeId === s.id ? null : s.id)}
                      aria-pressed={sizeId === s.id}
                      // Disabled, never hidden (D-046): the customer must be
                      // able to see the size exists and is simply unavailable.
                      className={`min-w-12 rounded-control border px-3 py-2 text-sm transition-colors duration-fast ${
                        sizeId === s.id
                          ? 'border-neon text-neon'
                          : exists
                            ? 'border-ink-raised text-white'
                            : 'border-ink-raised text-muted/40 line-through'
                      }`}
                    >
                      {pick({ fr: s.label_fr, ar: s.label_ar })}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <p className="mt-5 text-sm">
            {!inStock ? (
              <span className="text-signal">{t.product.outOfStock}</span>
            ) : variant && stock <= threshold ? (
              // Exact counts are only shown below the threshold (D-047).
              <span className="text-highlight">
                {interpolate(t.product.lastUnits, { count: stock })}
              </span>
            ) : (
              <span className="text-success">{t.product.inStock}</span>
            )}
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            {/* Order now is the primary action: most orders here are a single
                item, and routing one t-shirt through cart -> checkout loses
                orders a form on this page would have captured. */}
            <button
              type="button"
              className="btn-primary"
              disabled={!variant || stock <= 0}
              onClick={() => setOrdering(true)}
            >
              {t.product.orderNow}
            </button>

            <button
              type="button"
              className="btn-secondary"
              disabled={!variant || stock <= 0}
              onClick={() => {
                if (!variant) return;
                cart.add({ variantId: variant.id, quantity: 1 });
                setAdded(true);
                setTimeout(() => setAdded(false), 2000);
              }}
            >
              {added ? '✓' : t.product.addToCart}
            </button>

            {waLink && (
              // Some customers will never trust a web form. Give them the
              // channel they already use, pre-filled (D-200).
              <a href={waLink} target="_blank" rel="noreferrer" className="btn-secondary">
                {t.product.orderViaWhatsapp}
              </a>
            )}
          </div>

          <div className="mt-8">
            <DeliveryEstimator />
          </div>

          {pick({ fr: data.description_fr, ar: data.description_ar }) && (
            <details className="mt-6 border-t border-ink-raised pt-4" open>
              <summary className="cursor-pointer text-sm text-muted">
                {t.product.description}
              </summary>
              <p className="mt-3 whitespace-pre-line leading-relaxed text-metal">
                {pick({ fr: data.description_fr, ar: data.description_ar })}
              </p>
            </details>
          )}

          {pick({ fr: data.size_guide_fr, ar: data.size_guide_ar }) && (
            <details className="mt-2 border-t border-ink-raised pt-4">
              <summary className="cursor-pointer text-sm text-muted">{t.product.sizeGuide}</summary>
              <p className="mt-3 whitespace-pre-line text-metal">
                {pick({ fr: data.size_guide_fr, ar: data.size_guide_ar })}
              </p>
            </details>
          )}
        </div>
      </div>

      {ordering && (
        <QuickOrder
          variantId={variant?.id ?? null}
          unitPrice={unit}
          disabled={!variant || stock <= 0}
          onClose={() => setOrdering(false)}
        />
      )}

      {/* Sticky order bar on phones: the price and the action stay reachable
          however far the customer has scrolled. */}
      <div className="fixed inset-x-0 bottom-16 z-10 flex items-center gap-3 border-t border-ink-raised bg-ink-surface px-4 py-3 lg:hidden">
        <span className="text-lg">{price(unit)}</span>
        <button
          type="button"
          className="btn-primary ms-auto"
          disabled={!variant || stock <= 0}
          onClick={() => setOrdering(true)}
        >
          {t.product.orderNow}
        </button>
      </div>
    </main>
  );
}
