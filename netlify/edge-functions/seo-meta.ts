import type { Config, Context } from '@netlify/edge-functions';

/**
 * Crawler metadata injection.
 *
 * This is the answer to C-02. Vite ships a client-rendered SPA, and social
 * crawlers — Facebook, Instagram, WhatsApp, TikTok — do not execute JavaScript
 * at all. Without this, every shared link would show an empty preview card, and
 * shared links are how almost all of this shop's traffic arrives (D-173).
 *
 * It runs at the edge, before the HTML reaches the requester, and rewrites the
 * head using the SAME CMS fields the page itself uses. There is no second
 * source of truth to drift.
 *
 * Human visitors are passed straight through: React renders the real page and
 * `useSeo` sets the same values client-side.
 */

const CRAWLERS = [
  'facebookexternalhit',
  'facebot',
  'twitterbot',
  'whatsapp',
  'telegrambot',
  'linkedinbot',
  'slackbot',
  'discordbot',
  'pinterest',
  'googlebot',
  'bingbot',
  'yandexbot',
  'applebot',
  'tiktok',
  'instagram',
  'embedly',
  'quora link preview',
  'skypeuripreview',
];

function isCrawler(userAgent: string): boolean {
  const ua = userAgent.toLowerCase();
  return CRAWLERS.some((bot) => ua.includes(bot));
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export default async function handler(request: Request, context: Context) {
  const response = await context.next();

  const userAgent = request.headers.get('user-agent') ?? '';
  if (!isCrawler(userAgent)) return response;

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('text/html')) return response;

  try {
    const url = new URL(request.url);
    const segments = url.pathname.split('/').filter(Boolean);
    const locale = segments[0] === 'ar' ? 'ar' : 'fr';
    const path = '/' + segments.slice(1).join('/');

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const siteUrl = Deno.env.get('SITE_URL') ?? url.origin;
    if (!supabaseUrl || !anonKey) return response;

    const seoResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/seo_for_path`, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_path: path === '/' ? '/' : path, p_locale: locale }),
    });

    if (!seoResponse.ok) return response;

    const seo = (await seoResponse.json()) as {
      title: string;
      description: string;
      image: string | null;
      type: string;
      price?: number;
      available?: boolean;
      has_ar?: boolean;
    };

    const canonical = `${siteUrl}${url.pathname}`;
    const bare = path === '/' ? '' : path;
    const imageUrl = seo.image
      ? `${supabaseUrl}/storage/v1/object/public/media/${seo.image}`
      : null;

    const tags = [
      `<title>${escapeHtml(seo.title)}</title>`,
      `<meta name="description" content="${escapeHtml(seo.description ?? '')}">`,
      `<meta property="og:title" content="${escapeHtml(seo.title)}">`,
      `<meta property="og:description" content="${escapeHtml(seo.description ?? '')}">`,
      `<meta property="og:type" content="${seo.type === 'product' ? 'product' : 'website'}">`,
      `<meta property="og:url" content="${escapeHtml(canonical)}">`,
      `<meta property="og:site_name" content="YAKOUB BIG BOSS">`,
      `<meta property="og:locale" content="${locale === 'ar' ? 'ar_DZ' : 'fr_DZ'}">`,
      `<meta name="twitter:card" content="summary_large_image">`,
      `<link rel="canonical" href="${escapeHtml(canonical)}">`,
      `<link rel="alternate" hreflang="fr" href="${escapeHtml(`${siteUrl}/fr${bare}`)}">`,
      // Arabic is declared only when Arabic content exists (D-265). Claiming
      // otherwise invites a duplicate-content penalty.
      seo.has_ar === false
        ? ''
        : `<link rel="alternate" hreflang="ar" href="${escapeHtml(`${siteUrl}/ar${bare}`)}">`,
      `<link rel="alternate" hreflang="x-default" href="${escapeHtml(`${siteUrl}/fr${bare}`)}">`,
      imageUrl ? `<meta property="og:image" content="${escapeHtml(imageUrl)}">` : '',
      imageUrl ? `<meta name="twitter:image" content="${escapeHtml(imageUrl)}">` : '',
      seo.price != null
        ? `<meta property="product:price:amount" content="${seo.price}">
           <meta property="product:price:currency" content="DZD">`
        : '',
      seo.available != null
        ? `<meta property="product:availability" content="${seo.available ? 'in stock' : 'out of stock'}">`
        : '',
    ]
      .filter(Boolean)
      .join('\n');

    let html = await response.text();
    // Replace the static title rather than leaving two in the document.
    html = html.replace(/<title>.*?<\/title>/i, '');
    html = html.replace('</head>', `${tags}\n</head>`);
    html = html.replace('<html lang="fr" dir="ltr">',
      `<html lang="${locale}" dir="${locale === 'ar' ? 'rtl' : 'ltr'}">`);

    return new Response(html, {
      status: response.status,
      headers: { ...Object.fromEntries(response.headers), 'content-type': 'text/html; charset=utf-8' },
    });
  } catch {
    // A metadata failure must never break the page. Serve the original.
    return response;
  }
}

export const config: Config = {
  path: '/*',
  // Assets never need meta injection and would waste edge invocations.
  excludedPath: ['/assets/*', '/fonts/*', '/*.js', '/*.css', '/*.xml', '/*.txt', '/*.svg'],
};
