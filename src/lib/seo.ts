import { useEffect } from 'react';
import { SITE_URL } from '@/lib/env';
import type { Locale } from '@/i18n/locale';

/**
 * Head management, hand-rolled.
 *
 * A helmet library would add weight to do something this app needs in exactly
 * four places. Everything below writes directly to the document head and
 * cleans up after itself.
 *
 * This handles the human path. Social crawlers do not run JavaScript at all —
 * they are served by the Netlify edge function, which reads the same CMS
 * fields (D-172, D-173).
 */

interface SeoInput {
  title: string;
  description?: string | null;
  /** Path WITHOUT the locale prefix, e.g. `/product/t-shirt`. */
  path: string;
  locale: Locale;
  image?: string | null;
  /** Emit the Arabic hreflang only when Arabic content actually exists (D-265). */
  hasArabic?: boolean;
  type?: 'website' | 'product';
  noindex?: boolean;
}

function setMeta(selector: string, attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.content = content;
}

function setLink(rel: string, href: string, hreflang?: string) {
  const selector = hreflang
    ? `link[rel="${rel}"][hreflang="${hreflang}"]`
    : `link[rel="${rel}"]:not([hreflang])`;
  let el = document.head.querySelector<HTMLLinkElement>(selector);
  if (!el) {
    el = document.createElement('link');
    el.rel = rel;
    if (hreflang) el.hreflang = hreflang;
    document.head.appendChild(el);
  }
  el.href = href;
}

export function useSeo(input: SeoInput) {
  const {
    title,
    description,
    path,
    locale,
    image,
    hasArabic = true,
    type = 'website',
    noindex = false,
  } = input;

  useEffect(() => {
    document.title = title;

    if (description) {
      setMeta('meta[name="description"]', 'name', 'description', description);
      setMeta('meta[property="og:description"]', 'property', 'og:description', description);
      setMeta('meta[name="twitter:description"]', 'name', 'twitter:description', description);
    }

    setMeta('meta[property="og:title"]', 'property', 'og:title', title);
    setMeta('meta[property="og:type"]', 'property', 'og:type', type);
    setMeta('meta[property="og:site_name"]', 'property', 'og:site_name', 'YAKOUB BIG BOSS');
    setMeta('meta[property="og:locale"]', 'property', 'og:locale', locale === 'ar' ? 'ar_DZ' : 'fr_DZ');
    setMeta('meta[name="twitter:card"]', 'name', 'twitter:card', 'summary_large_image');
    setMeta('meta[name="twitter:title"]', 'name', 'twitter:title', title);

    // Every URL is built from SITE_URL, so switching to the real domain is one
    // environment variable (D-177).
    const canonical = `${SITE_URL}/${locale}${path === '/' ? '' : path}`;
    setMeta('meta[property="og:url"]', 'property', 'og:url', canonical);
    setLink('canonical', canonical);

    setLink('alternate', `${SITE_URL}/fr${path === '/' ? '' : path}`, 'fr');
    if (hasArabic) {
      setLink('alternate', `${SITE_URL}/ar${path === '/' ? '' : path}`, 'ar');
    } else {
      document.head.querySelector('link[rel="alternate"][hreflang="ar"]')?.remove();
    }
    setLink('alternate', `${SITE_URL}/fr${path === '/' ? '' : path}`, 'x-default');

    if (image) {
      setMeta('meta[property="og:image"]', 'property', 'og:image', image);
      setMeta('meta[name="twitter:image"]', 'name', 'twitter:image', image);
    }

    const robots = document.head.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if (noindex) {
      setMeta('meta[name="robots"]', 'name', 'robots', 'noindex, nofollow');
    } else {
      robots?.remove();
    }
  }, [title, description, path, locale, image, hasArabic, type, noindex]);
}

/**
 * JSON-LD.
 *
 * Product markup lets Google show price and availability directly in results —
 * which matters more here than a ranking position, because it answers the
 * customer's first question before they click.
 */
export function useJsonLd(id: string, data: object | null) {
  useEffect(() => {
    const elementId = `jsonld-${id}`;
    document.getElementById(elementId)?.remove();
    if (!data) return;

    const script = document.createElement('script');
    script.id = elementId;
    script.type = 'application/ld+json';
    script.textContent = JSON.stringify(data);
    document.head.appendChild(script);

    return () => {
      document.getElementById(elementId)?.remove();
    };
  }, [id, data]);
}

export function productJsonLd(input: {
  name: string;
  description: string | null;
  image: string | null;
  sku: string | null;
  price: number;
  inStock: boolean;
  url: string;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: input.name,
    description: input.description ?? undefined,
    image: input.image ?? undefined,
    sku: input.sku ?? undefined,
    brand: { '@type': 'Brand', name: 'YAKOUB BIG BOSS' },
    offers: {
      '@type': 'Offer',
      url: input.url,
      priceCurrency: 'DZD',
      price: input.price,
      availability: input.inStock
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
      // Cash on delivery, no online payment (D-022).
      acceptedPaymentMethod: 'http://purl.org/goodrelations/v1#COD',
    },
  };
}

/**
 * LocalBusiness markup.
 *
 * The shop has a real address and real foot traffic. This is what makes
 * "magasin vêtements Boudouaou" find it.
 */
export function localBusinessJsonLd(settings: Record<string, unknown>) {
  const phone = settings['business.phone'] as string | undefined;
  const address = settings['business.address_fr'] as string | undefined;
  if (!phone && !address) return null;

  return {
    '@context': 'https://schema.org',
    '@type': 'ClothingStore',
    name: (settings['business.name'] as string) ?? 'YAKOUB BIG BOSS',
    telephone: phone,
    url: SITE_URL,
    address: address
      ? { '@type': 'PostalAddress', streetAddress: address, addressCountry: 'DZ' }
      : undefined,
    currenciesAccepted: 'DZD',
    paymentAccepted: 'Cash on delivery',
  };
}
