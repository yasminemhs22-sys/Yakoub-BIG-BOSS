import { createClient } from '@supabase/supabase-js';
import type { Handler, HandlerEvent } from '@netlify/functions';

/**
 * Order submission proxy.
 *
 * Closes the gap flagged in Phase 7: the browser cannot supply a trustworthy IP
 * address, so per-IP rate limiting was inert. A client-supplied address is
 * forged in seconds, and passing one would have made the limit worse than
 * having none.
 *
 * Netlify sees the real address. This function reads it from the platform and
 * passes it to `place_order`, so the IP limit that already exists in the
 * database finally has something honest to work with.
 *
 * Everything else is unchanged: no price, no total, no delivery fee crosses
 * this boundary. The database still computes every figure (D-274). This adds
 * one fact the browser cannot be trusted to provide, and nothing else.
 *
 * There is no payment step here, so this form is the entire fraud surface.
 */

interface OrderPayload {
  p_first_name: string;
  p_last_name: string;
  p_phone: string;
  p_wilaya_id: string;
  p_commune_id: string;
  p_method_id: string;
  p_address?: string | null;
  p_notes?: string | null;
  p_items: { variant_id: string; quantity: number }[];
  p_honeypot?: string | null;
}

const ALLOWED_KEYS = new Set<keyof OrderPayload>([
  'p_first_name',
  'p_last_name',
  'p_phone',
  'p_wilaya_id',
  'p_commune_id',
  'p_method_id',
  'p_address',
  'p_notes',
  'p_items',
  'p_honeypot',
]);

function clientIp(event: HandlerEvent): string | null {
  // Netlify sets this from the edge; it is not caller-controllable.
  const direct = event.headers['x-nf-client-connection-ip'];
  if (direct) return direct;

  // Fallback: the LEFTMOST entry is the client, but only the rightmost hops are
  // trustworthy. Taking the first is standard here because Netlify appends its
  // own, and a forged prefix cannot displace the platform's value above.
  const forwarded = event.headers['x-forwarded-for'];
  return forwarded ? forwarded.split(',')[0]!.trim() : null;
}

export const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ ok: false, reason: 'method' }) };
  }

  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const anonKey = process.env.SUPABASE_ANON_KEY;
    if (!supabaseUrl || !anonKey) {
      return { statusCode: 500, body: JSON.stringify({ ok: false, reason: 'not_configured' }) };
    }

    const raw = JSON.parse(event.body ?? '{}') as Record<string, unknown>;

    // Strip anything not in the allow-list. Without this, a caller could append
    // `p_ip` and defeat the very limit this function exists to enforce.
    const payload: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(raw)) {
      if (ALLOWED_KEYS.has(key as keyof OrderPayload)) payload[key] = value;
    }

    // Deliberately the ANON key, not service_role. The order path needs no
    // elevated rights — `place_order` is SECURITY DEFINER and does the work.
    // Using service_role here would hand RLS-bypassing power to a public
    // endpoint for no benefit.
    const supabase = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });

    const { data, error } = await supabase.rpc('place_order', {
      ...payload,
      p_ip: clientIp(event),
      p_user_agent: (event.headers['user-agent'] ?? '').slice(0, 300),
    });

    if (error) {
      // Trigger-level rejections (address required, commune/wilaya mismatch)
      // arrive as errors. Map them to codes the UI already knows, and do not
      // leak database internals to the browser.
      const message = error.message ?? '';
      const reason = message.includes('Address is required')
        ? 'address_required'
        : message.includes('Commune')
          ? 'invalid_destination'
          : message.includes('Variant unavailable')
            ? 'variant_unavailable'
            : 'generic';
      return { statusCode: 200, body: JSON.stringify({ ok: false, reason }) };
    }

    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(data),
    };
  } catch {
    return { statusCode: 200, body: JSON.stringify({ ok: false, reason: 'generic' }) };
  }
};
