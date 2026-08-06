import { useParams } from 'react-router-dom';
import { usePageWithBlocks } from '@/lib/queries/storefront';
import { BlockRenderer } from '@/components/storefront/Blocks';
import { SkeletonText } from '@/components/Skeleton';
import { useI18n } from '@/i18n';
import { useSeo } from '@/lib/seo';

/**
 * CMS pages — privacy, returns, terms, contact.
 *
 * Unpublished pages are filtered by RLS, so an unwritten policy returns nothing
 * rather than an empty legal page. No placeholder text ever ships (D-138).
 */
export default function CmsPage() {
  const { slug } = useParams();
  const { t, pick, locale } = useI18n();
  const { data, isLoading } = usePageWithBlocks(slug ?? '');

  useSeo({
    title: data
      ? `${pick({ fr: data.page.title_fr, ar: data.page.title_ar })} · YAKOUB BIG BOSS`
      : 'YAKOUB BIG BOSS',
    description: pick({
      fr: data?.page.meta_description_fr,
      ar: data?.page.meta_description_ar,
    }),
    path: `/p/${slug ?? ''}`,
    locale,
    hasArabic: Boolean(data?.page.title_ar?.trim()),
  });

  if (isLoading) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-12">
        <SkeletonText lines={10} />
      </main>
    );
  }

  if (!data) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-20 text-center">
        <p className="text-muted">{t.errors.notFound}</p>
      </main>
    );
  }

  return (
    <main>
      <div className="mx-auto max-w-3xl px-4 pt-12">
        <h1 className="font-display text-display-sm">
          {pick({ fr: data.page.title_fr, ar: data.page.title_ar })}
        </h1>
      </div>
      {data.blocks.map((b) => (
        <BlockRenderer key={b.id} block={b} />
      ))}
    </main>
  );
}
