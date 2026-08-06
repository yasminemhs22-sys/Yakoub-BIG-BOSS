import { Link } from 'react-router-dom';
import { useI18n } from '@/i18n';
import { useMediaLibrary } from '@/lib/queries/media';
import { imageSrcSet, imageUrl, SIZES } from '@/lib/image';
import { useSettings } from '@/lib/queries/settings';
import { parseBlock, type BlockType, type ContentBlock } from '@/lib/blocks';
import { useProductsByIds, usePublishedProducts, useVisibleCategories } from '@/lib/queries/storefront';
import { ProductCard } from './ProductCard';
import { Skeleton } from '@/components/Skeleton';

/**
 * Renders CMS blocks.
 *
 * Every block is typed and validated (D-133). Text goes through React as plain
 * strings, so anything resembling markup is displayed literally rather than
 * executed — there is no path from the CMS to injected HTML.
 *
 * An unknown or malformed block renders nothing rather than throwing: a bad
 * block must not take down the homepage.
 */
export function BlockRenderer({ block }: { block: ContentBlock }) {
  const type = block.block_type as BlockType;
  switch (type) {
    case 'announcement':
      return <AnnouncementBlock block={block} />;
    case 'hero':
      return <HeroBlock block={block} />;
    case 'category_strip':
      return <CategoryStripBlock block={block} />;
    case 'product_carousel':
      return <ProductCarouselBlock block={block} />;
    case 'promo_banner':
      return <PromoBannerBlock block={block} />;
    case 'trust_strip':
      return <TrustStripBlock block={block} />;
    case 'store_presence':
      return <StorePresenceBlock block={block} />;
    case 'rich_text':
      return <RichTextBlock block={block} />;
    default:
      return null;
  }
}

function useMediaPath(id: string | null): string | null {
  const { data } = useMediaLibrary();
  if (!id) return null;
  return data?.find((m) => m.id === id)?.storage_path ?? null;
}

function AnnouncementBlock({ block }: { block: ContentBlock }) {
  const { pick } = useI18n();
  const d = parseBlock('announcement', block.data);
  const text = pick(d.text);
  if (!text) return null;
  return (
    <div className="bg-neon px-4 py-2 text-center text-sm font-medium text-ink">{text}</div>
  );
}

function HeroBlock({ block }: { block: ContentBlock }) {
  const { pick, locale } = useI18n();
  const d = parseBlock('hero', block.data);
  const path = useMediaPath(d.media_id);
  const headline = pick(d.headline);

  return (
    <section className="relative isolate overflow-hidden">
      {path && (
        <img
          src={imageUrl(path, { width: 1280 })}
          srcSet={imageSrcSet(path, [640, 960, 1280, 1600])}
          sizes={SIZES.fullWidth}
          alt=""
          // Above the fold: load eagerly and give it priority.
          fetchPriority="high"
          className="absolute inset-0 -z-10 h-full w-full object-cover"
        />
      )}
      {/* The storefront photo is a night shot; without an overlay, white text
          on it is unreadable. Strength is admin-controlled. */}
      <div
        className="absolute inset-0 -z-10 bg-gradient-to-t from-ink via-ink/70 to-maroon/40"
        style={{ opacity: d.overlay / 100 }}
      />
      <div className="mx-auto max-w-content px-4 py-24 sm:py-32">
        <h1
          className={
            locale === 'ar'
              ? 'font-display text-ar-display-lg text-white'
              : 'font-display text-display-lg uppercase text-white'
          }
        >
          {headline}
        </h1>
        {pick(d.subheadline) && (
          <p className="mt-4 max-w-xl text-lg text-metal">{pick(d.subheadline)}</p>
        )}
        {d.cta.type !== 'none' && d.cta.value && (
          <Link to={d.cta.value} className="btn-primary mt-8">
            {d.cta.label ? pick(d.cta.label) : '→'}
          </Link>
        )}
      </div>
    </section>
  );
}

function CategoryStripBlock({ block }: { block: ContentBlock }) {
  const { pick, path } = useI18n();
  const d = parseBlock('category_strip', block.data);
  const { data: categories } = useVisibleCategories();
  const { data: media } = useMediaLibrary();

  const list = d.category_ids.length
    ? d.category_ids
        .map((id) => categories?.find((c) => c.id === id))
        .filter(Boolean)
    : (categories ?? []).filter((c) => !c.parent_id);

  if (!list.length) return null;

  return (
    <section className="mx-auto max-w-content px-4 py-12">
      {pick(d.title) && <h2 className="mb-6 font-display text-display-sm">{pick(d.title)}</h2>}
      {/* Horizontal scroll on mobile: a grid of six categories on a phone
          means six tiny unreadable tiles. */}
      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 lg:grid-cols-5">
        {list.map((c) => {
          const p = media?.find((m) => m.id === c!.media_id)?.storage_path;
          return (
            <Link
              key={c!.id}
              to={path(`/c/${c!.slug}`)}
              className="w-36 shrink-0 sm:w-auto"
            >
              <div className="aspect-square overflow-hidden rounded-card bg-ink-surface">
                {p && (
                  <img
                    src={imageUrl(p, { width: 320 })}
                    srcSet={imageSrcSet(p, [160, 240, 320])}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                )}
              </div>
              <p className="mt-2 text-center text-sm">{pick({ fr: c!.name_fr, ar: c!.name_ar })}</p>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function ProductCarouselBlock({ block }: { block: ContentBlock }) {
  const { pick } = useI18n();
  const d = parseBlock('product_carousel', block.data);

  const manual = useProductsByIds(d.source === 'manual' ? d.product_ids : []);
  const auto = usePublishedProducts({ limit: d.limit });
  const products = d.source === 'manual' ? manual.data : auto.data;
  const loading = d.source === 'manual' ? manual.isLoading : auto.isLoading;

  return (
    <section className="mx-auto max-w-content px-4 py-12">
      {pick(d.title) && <h2 className="mb-6 font-display text-display-sm">{pick(d.title)}</h2>}
      {loading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="aspect-[3/4]" />
          ))}
        </div>
      ) : !products?.length ? null : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      )}
    </section>
  );
}

function PromoBannerBlock({ block }: { block: ContentBlock }) {
  const d = parseBlock('promo_banner', block.data);
  const path = useMediaPath(d.media_id);
  if (!path) return null;
  const img = (
    <img
      src={imageUrl(path, { width: 1280 })}
      alt=""
      loading="lazy"
      className="w-full rounded-card object-cover"
    />
  );
  return (
    <section className="mx-auto max-w-content px-4 py-8">
      {d.link.type !== 'none' && d.link.value ? <Link to={d.link.value}>{img}</Link> : img}
    </section>
  );
}

const TRUST_ICONS: Record<string, string> = {
  delivery: '🚚',
  cash: '💵',
  quality: '✔',
  whatsapp: '💬',
  return: '↩',
};

function TrustStripBlock({ block }: { block: ContentBlock }) {
  const { pick } = useI18n();
  const d = parseBlock('trust_strip', block.data);
  if (!d.items.length) return null;
  return (
    <section className="border-y border-ink-raised bg-ink-surface">
      <div className="mx-auto grid max-w-content gap-6 px-4 py-8 sm:grid-cols-2 lg:grid-cols-4">
        {d.items.map((item, i) => (
          <div key={i} className="text-center sm:text-start">
            <span className="text-2xl" aria-hidden="true">
              {TRUST_ICONS[item.icon] ?? '•'}
            </span>
            <p className="mt-2 font-medium">{pick(item.title)}</p>
            <p className="mt-1 text-sm text-muted">{pick(item.text)}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function StorePresenceBlock({ block }: { block: ContentBlock }) {
  const { pick } = useI18n();
  const d = parseBlock('store_presence', block.data);
  const path = useMediaPath(d.media_id);
  const { data: settings } = useSettings();
  const phone = (settings?.['business.phone'] as string) ?? '';
  const whatsapp = (settings?.['business.whatsapp'] as string) ?? phone;

  return (
    <section className="mx-auto grid max-w-content items-center gap-8 px-4 py-12 lg:grid-cols-2">
      {path && (
        <img
          src={imageUrl(path, { width: 1280 })}
          alt=""
          loading="lazy"
          className="w-full rounded-card object-cover"
        />
      )}
      <div>
        <h2 className="font-display text-display-sm">{pick(d.title)}</h2>
        <p className="mt-3 text-muted">{pick(d.address)}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          {d.map_url && (
            <a href={d.map_url} target="_blank" rel="noreferrer" className="btn-secondary">
              Maps
            </a>
          )}
          {d.show_phone && phone && (
            <a href={`tel:${phone}`} className="btn-secondary" dir="ltr">
              {phone}
            </a>
          )}
          {d.show_whatsapp && whatsapp && (
            <a
              href={`https://wa.me/213${whatsapp.replace(/^0/, '').replace(/\D/g, '')}`}
              target="_blank"
              rel="noreferrer"
              className="btn-secondary"
            >
              WhatsApp
            </a>
          )}
        </div>
      </div>
    </section>
  );
}

function RichTextBlock({ block }: { block: ContentBlock }) {
  const { pick } = useI18n();
  const d = parseBlock('rich_text', block.data);
  const body = pick(d.body);
  if (!body) return null;
  return (
    <section className="mx-auto max-w-3xl px-4 py-12">
      {pick(d.title) && <h2 className="mb-4 font-display text-display-sm">{pick(d.title)}</h2>}
      {/* Split on blank lines rather than rendering HTML. Any markup the admin
          types appears as literal characters — the whole point of D-133. */}
      {body.split(/\n\s*\n/).map((para, i) => (
        <p key={i} className="mb-4 leading-relaxed text-metal">
          {para}
        </p>
      ))}
    </section>
  );
}
