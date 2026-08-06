import { createClient } from '@supabase/supabase-js';
import type { Handler } from '@netlify/functions';

/**
 * Sitemap, generated live from the CMS.
 *
 * A static file would go stale the moment the owner publishes a product, and
 * nobody would notice for weeks. This reads the same `sitemap_entries()`
 * function the rest of the SEO layer uses.
 *
 * The Arabic URL is emitted only where Arabic content exists (D-265) — the
 * storefront still falls back silently for customers, but Google is told the
 * truth.
 */
export const handler: Handler = async () => {
  try {
    // Server config is explicit. Falling back to VITE_ variables would make a
    // server function silently depend on client configuration, and the two are
    // set in different places.
    const supabaseUrl = process.env.SUPABASE_URL;
    const anonKey = process.env.SUPABASE_ANON_KEY;
    const siteUrl = (process.env.SITE_URL ?? '').replace(/\/$/, '');

    if (!supabaseUrl || !anonKey || !siteUrl) {
      return { statusCode: 500, body: 'sitemap not configured' };
    }

    const supabase = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
    const { data, error } = await supabase.rpc('sitemap_entries');
    if (error) throw error;

    const entries = (data ?? []) as {
      path: string;
      updated_at: string;
      priority: number;
      changefreq: string;
      has_ar: boolean;
    }[];

    const urls = entries
      .flatMap((entry) => {
        const locales = entry.has_ar ? ['fr', 'ar'] : ['fr'];
        const bare = entry.path === '/' ? '' : entry.path;

        return locales.map((locale) => {
          const alternates = locales
            .map(
              (alt) =>
                `    <xhtml:link rel="alternate" hreflang="${alt}" href="${siteUrl}/${alt}${bare}"/>`,
            )
            .concat(
              `    <xhtml:link rel="alternate" hreflang="x-default" href="${siteUrl}/fr${bare}"/>`,
            )
            .join('\n');

          return `  <url>
    <loc>${siteUrl}/${locale}${bare}</loc>
    <lastmod>${new Date(entry.updated_at).toISOString().split('T')[0]}</lastmod>
    <changefreq>${entry.changefreq}</changefreq>
    <priority>${entry.priority}</priority>
${alternates}
  </url>`;
        });
      })
      .join('\n');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls}
</urlset>`;

    return {
      statusCode: 200,
      headers: {
        'content-type': 'application/xml; charset=utf-8',
        // Cached at the edge for an hour: crawlers do not need it fresher, and
        // this keeps the database out of the crawl path.
        'cache-control': 'public, max-age=3600',
      },
      body: xml,
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: error instanceof Error ? error.message : 'sitemap error',
    };
  }
};
