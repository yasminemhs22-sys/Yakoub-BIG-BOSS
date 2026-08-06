import { useParams } from 'react-router-dom';
import { usePublishedProducts, useVisibleCategories } from '@/lib/queries/storefront';
import { ProductCard } from '@/components/storefront/ProductCard';
import { Skeleton } from '@/components/Skeleton';
import { useI18n } from '@/i18n';
import { useSeo } from '@/lib/seo';

export default function Category() {
  const { slug } = useParams();
  const { pick, locale } = useI18n();
  const { data: categories } = useVisibleCategories();
  const { data, isLoading } = usePublishedProducts({ categorySlug: slug, limit: 48 });

  const category = categories?.find((c) => c.slug === slug);

  useSeo({
    title: category
      ? `${pick({ fr: category.name_fr, ar: category.name_ar })} · YAKOUB BIG BOSS`
      : 'YAKOUB BIG BOSS',
    path: `/c/${slug ?? ''}`,
    locale,
    hasArabic: Boolean(category?.name_ar?.trim()),
  });

  return (
    <main className="mx-auto max-w-content px-4 py-10">
      <h1
        className={
          locale === 'ar' ? 'font-display text-ar-display-md' : 'font-display text-display-md'
        }
      >
        {category ? pick({ fr: category.name_fr, ar: category.name_ar }) : slug}
      </h1>

      {isLoading ? (
        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="aspect-[3/4]" />
          ))}
        </div>
      ) : !data?.length ? (
        <p className="mt-12 text-muted">
          {locale === 'ar' ? 'لا توجد منتجات في هذا القسم بعد.' : 'Aucun produit dans cette catégorie.'}
        </p>
      ) : (
        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {data.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      )}
    </main>
  );
}
