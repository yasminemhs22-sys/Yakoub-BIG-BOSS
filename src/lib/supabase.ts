import { createClient } from '@supabase/supabase-js';
import { env } from './env';
import type { Database } from './database.types';

/**
 * The single Supabase client for the whole app.
 *
 * This uses the ANON key, and it is published in the browser bundle by design.
 * That is safe only because Row Level Security is doing the real work: the
 * Phase 1 verification proved that an anon session can read no order, no
 * customer, no admin and no audit row, and can write nothing at all.
 *
 * The service_role key must NEVER appear in this file or anywhere under src/.
 * Anything needing it belongs in a Netlify Function (D-175).
 */
export const supabase = createClient<Database>(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  auth: {
    // Staff only. The storefront is entirely anonymous (D-115), so a session
    // exists solely for the dashboard.
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
  global: {
    headers: { 'x-application-name': 'yakoub-big-boss' },
  },
});
