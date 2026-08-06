import { z } from 'zod';

/**
 * Environment validation.
 *
 * A missing or malformed Supabase URL should fail loudly at startup with a
 * message that says what to do, not silently produce failed network calls that
 * look like a database problem three screens later.
 */
const schema = z.object({
  VITE_SUPABASE_URL: z.string().url('VITE_SUPABASE_URL must be a full URL'),
  VITE_SUPABASE_ANON_KEY: z.string().min(20, 'VITE_SUPABASE_ANON_KEY looks too short'),
  VITE_SITE_URL: z.string().url().default('http://localhost:5173'),
});

const parsed = schema.safeParse(import.meta.env);

if (!parsed.success) {
  const details = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  throw new Error(
    `Environment is not configured.\n${details}\n\n` +
      `Copy .env.example to .env and fill in the values from your Supabase\n` +
      `dashboard (Settings > API).`,
  );
}

export const env = parsed.data;

/**
 * The canonical origin, without a trailing slash.
 *
 * Every canonical tag, hreflang link, sitemap entry, Open Graph URL and JSON-LD
 * block reads from here, so pointing at the real domain later is a single
 * environment variable change (D-177).
 */
export const SITE_URL = env.VITE_SITE_URL.replace(/\/$/, '');
