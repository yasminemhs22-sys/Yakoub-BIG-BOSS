import type { Handler } from '@netlify/functions';

/**
 * robots.txt.
 *
 * Generated rather than static so the sitemap URL follows SITE_URL, and so the
 * admin area is excluded without anyone having to remember to edit a file.
 */
export const handler: Handler = async () => {
  const siteUrl = (process.env.SITE_URL ?? '').replace(/\/$/, '');

  // A preview deploy must never be indexed: duplicate content competing with
  // the real shop is worse than no indexing at all.
  const isProduction = process.env.CONTEXT === 'production';

  const body = isProduction
    ? `User-agent: *
Allow: /

# The dashboard holds customer data and has no public value.
Disallow: /fr/admin
Disallow: /ar/admin
Disallow: /*/checkout
Disallow: /*/cart

Sitemap: ${siteUrl}/sitemap.xml`
    : `User-agent: *
Disallow: /`;

  return {
    statusCode: 200,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' },
    body,
  };
};
