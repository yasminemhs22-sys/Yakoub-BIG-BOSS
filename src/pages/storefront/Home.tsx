import { ProductCard } from '@/components/storefront/ProductCard';
import { Skeleton } from '@/components/Skeleton';
import { usePublishedProducts } from '@/lib/queries/storefront';
import { useI18n } from '@/i18n';

export default function Home() {
  const { t } = useI18n();

  const {
    data: products,
    isLoading,
    error,
  } = usePublishedProducts({ limit: 8 });

  if (isLoading) {
    return (
      <main className="mx-auto max-w-content px-4 py-12">
        <Skeleton className="h-12 w-48" />

        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="aspect-[3/4]" />
          ))}
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="mx-auto max-w-content px-4 py-12">
        <h1 className="font-display text-display-md">
          {t.nav.newArrivals}
        </h1>

        <p className="mt-4 text-muted">
          Une erreur est survenue. / حدث خطأ.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-content px-4 py-12">
      <h1 className="font-display text-display-md">
        {t.nav.newArrivals}
      </h1>

      {products && products.length > 0 ? (
        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      ) : (
        <p className="mt-8 text-muted">
          Aucun produit disponible.
        </p>
      )}
    </main>
  );
}