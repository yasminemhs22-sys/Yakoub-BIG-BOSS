import { Link } from 'react-router-dom';
import { useI18n } from '@/i18n';
import { imageSrcSet, imageUrl, SIZES } from '@/lib/image';
import type { StorefrontProduct } from '@/lib/queries/storefront';

export function ProductCard({ product }: { product: StorefrontProduct }) {
  const { price, path, pick } = useI18n();
  const name = pick({ fr: product.name_fr, ar: product.name_ar });
  const onSale = product.sale_price != null;

  return (
    <Link to={path(`/product/${product.slug}`)} className="group block">
      <div className="relative aspect-[3/4] overflow-hidden rounded-card bg-ink-surface">
        {product.featured_path ? (
          <img
            src={imageUrl(product.featured_path, { width: 480 })}
            srcSet={imageSrcSet(product.featured_path, [240, 320, 480, 640])}
            sizes={SIZES.productCard}
            alt={pick({ fr: product.featured_alt_fr, ar: product.featured_alt_ar }) || name}
            loading="lazy"
            // Fixed aspect ratio on the container prevents layout shift while
            // the image loads — important on slow connections.
            className="h-full w-full object-cover transition-transform duration-slow group-hover:scale-105"
          />
        ) : (
          <div className="h-full w-full bg-ink-raised" />
        )}
        {onSale && (
          <span className="absolute start-2 top-2 rounded bg-highlight px-2 py-0.5 text-xs font-semibold text-ink">
            -{Math.round((1 - product.sale_price! / product.original_price) * 100)}%
          </span>
        )}
      </div>

      <h3 className="mt-3 text-sm text-white">{name}</h3>
      <p className="mt-1 text-sm">
        {onSale ? (
          <>
            <span className="text-neon">{price(product.sale_price!)}</span>{' '}
            <span className="text-muted line-through">{price(product.original_price)}</span>
          </>
        ) : (
          <span className="text-white">{price(product.original_price)}</span>
        )}
      </p>
    </Link>
  );
}
