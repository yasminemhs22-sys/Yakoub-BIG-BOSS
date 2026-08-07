import { usePageWithBlocks, usePublishedProducts } from '@/lib/queries/storefront';
import { BlockRenderer } from '@/components/storefront/Blocks';
import { ProductCard } from '@/components/storefront/ProductCard';
import { Skeleton } from '@/components/Skeleton';
import { useI18n } from '@/i18n';
import { useSeo, useJsonLd, localBusinessJsonLd } from '@/lib/seo';
import { useSettings } from '@/lib/queries/settings';
import { useEffect, useState } from 'react';

export default function Home() {
  const { t, locale, pick } = useI18n();
  const { data, isLoading } = usePageWithBlocks('home');
  const fallback = usePublishedProducts({ limit: 8 });
  const { data: settings } = useSettings();

  const [loadingTimedOut, setLoadingTimedOut] = useState(false);

  useEffect(() => {
    if (!isLoading) {
      setLoadingTimedOut(false);
      return;
    }

    const timer = window.setTimeout(() => {
      setLoadingTimedOut(true);
    }, 5000);

    return () => window.clearTimeout(timer);
  }, [isLoading]);

  useSeo({
    title:
      pick({
        fr: data?.page.meta_title_fr,
        ar: data?.page.meta_title_ar,
      }) || 'YAKOUB BIG BOSS',
    description: pick({
      fr: data?.page.meta_description_fr,
      ar: data?.page.meta_description_ar,
    }),
    path: '/',
    locale,
    hasArabic: Boolean(data?.page.title_ar?.trim()),
  });

  useJsonLd(
    'local-business',
    settings ? localBusinessJsonLd(settings) : null,
  );

  /*
   * Never keep the entire storefront blocked forever if the CMS request
   * becomes slow or unavailable.
   *
   * After 5 seconds we continue to the product fallback instead of leaving
   * the customer on an infinite loading screen.
   */
  if (isLoading && !loadingTimedOut && !data) {
    return (
      <main>
        <Skeleton className="h-80 w-full" />
        <div className="mx-auto grid max-w-content grid-cols-2 gap-4 px-4 py-12 sm:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="aspect-[3/4]" />
          ))}
        </div>
      </main>
    );
  }

  const blocks = data?.blocks ?? [];

  if (!blocks.length) {
    return (
      <main className="mx-auto max-w-content px-4 py-12">
        <h1 className="font-display text-display-md">
          {t.nav.newArrivals}
        </h1>

        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {fallback.data?.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </main>
    );
  }

  return (
    <main>
      {blocks.map((b) => (
        <BlockRenderer key={b.id} block={b} />
      ))}
    </main>
  );
}