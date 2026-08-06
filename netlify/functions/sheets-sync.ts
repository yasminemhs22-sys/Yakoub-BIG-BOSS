import { createClient } from '@supabase/supabase-js';
import { google } from 'googleapis';
import type { Handler, HandlerEvent } from '@netlify/functions';

/**
 * Google Sheets sync worker.
 *
 * Runs on Netlify, never in the browser. It holds the service-role key and the
 * Google credentials, and neither may ever appear under `src/` (D-175).
 *
 * The contract with the rest of the system is deliberately narrow:
 *
 *   - it reads rows the database hands it via claim_sheets_sync_batch()
 *   - it appends to one sheet (D-152)
 *   - it reports success or failure back to the queue
 *
 * It never touches `orders`. If Google is down, the token has expired or the
 * sheet was renamed, the failure is confined to a queue row. Confirmations
 * already committed, stock already moved, and the customer already has their
 * reference number (D-155).
 */

const HEADERS = [
  'Référence',
  'Date',
  'Confirmée le',
  'Prénom',
  'Nom',
  'Téléphone',
  'Code wilaya',
  'Wilaya',
  'Commune',
  'Livraison',
  'Adresse',
  'Articles',
  'SKU',
  'Sous-total',
  'Frais livraison',
  'Total',
  'Statut',
  'Transporteur',
  'Suivi',
  'Remarques',
];

const FIELD_ORDER = [
  'reference',
  'created_at',
  'confirmed_at',
  'first_name',
  'last_name',
  'phone',
  'wilaya_code',
  'wilaya',
  'commune',
  'delivery_method',
  'address',
  'items',
  'skus',
  'subtotal',
  'delivery_fee',
  'total',
  'status',
  'delivery_company',
  'tracking_number',
  'notes',
] as const;

interface QueueRow {
  id: number;
  order_id: string;
  attempts: number;
}

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function sheetsClient() {
  // The service-account JSON is stored as a single environment variable rather
  // than a file: Netlify Functions have no persistent filesystem.
  const credentials = JSON.parse(env('GOOGLE_SERVICE_ACCOUNT_JSON')) as {
    client_email: string;
    private_key: string;
  };

  const auth = new google.auth.JWT({
    email: credentials.client_email,
    // Netlify stores newlines escaped; restore them or the key is rejected.
    key: credentials.private_key.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  return google.sheets({ version: 'v4', auth });
}

/** Writes the header row once, if the sheet is empty. */
async function ensureHeaders(
  sheets: ReturnType<typeof sheetsClient>,
  spreadsheetId: string,
  tab: string,
) {
  const existing = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${tab}!A1:A1`,
  });
  if (existing.data.values?.length) return;

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${tab}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: [HEADERS] },
  });
}

export const handler: Handler = async (event: HandlerEvent) => {
  // A shared secret so the endpoint cannot be triggered by anyone who finds
  // the URL. Netlify's own scheduler passes it as a header.
  const secret = event.headers['x-sync-secret'];
  if (process.env.SYNC_SECRET && secret !== process.env.SYNC_SECRET) {
    return { statusCode: 401, body: 'unauthorised' };
  }

  let claimed: QueueRow[] = [];

  try {
    const supabase = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { persistSession: false },
    });

    // The database decides what to work on: FOR UPDATE SKIP LOCKED means two
    // concurrent invocations never process the same row.
    const { data, error } = await supabase.rpc('claim_sheets_sync_batch', { p_limit: 20 });
    if (error) throw error;

    claimed = (data ?? []) as QueueRow[];
    if (!claimed.length) {
      return { statusCode: 200, body: JSON.stringify({ processed: 0 }) };
    }

    const spreadsheetId = env('GOOGLE_SHEET_ID');
    const tab = process.env.GOOGLE_SHEET_TAB ?? 'Commandes';
    const sheets = sheetsClient();

    await ensureHeaders(sheets, spreadsheetId, tab);

    const rows: (string | number)[][] = [];
    const succeeded: number[] = [];

    for (const item of claimed) {
      try {
        // The payload is built in SQL so column order lives in one place.
        const { data: payload, error: payloadError } = await supabase.rpc(
          'sheets_order_payload',
          { p_order_id: item.order_id },
        );
        if (payloadError) throw payloadError;
        if (!payload) throw new Error('order not found');

        const record = payload as Record<string, unknown>;
        rows.push(FIELD_ORDER.map((key) => (record[key] ?? '') as string | number));
        succeeded.push(item.id);
      } catch (rowError) {
        // One bad order must not stop the batch. Mark it and continue.
        await supabase.rpc('mark_sheets_failed', {
          p_id: item.id,
          p_error: rowError instanceof Error ? rowError.message : 'payload error',
        });
      }
    }

    if (rows.length) {
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `${tab}!A:T`,
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: rows },
      });
      await supabase.rpc('mark_sheets_synced', { p_ids: succeeded });
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ processed: succeeded.length, claimed: claimed.length }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';

    // The batch was already marked `processing` and its attempt counter
    // incremented. Push the rows back to `failed` so they are retried rather
    // than stranded — but only up to the limit the claim function enforces.
    try {
      const supabase = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
        auth: { persistSession: false },
      });
      for (const item of claimed) {
        await supabase.rpc('mark_sheets_failed', { p_id: item.id, p_error: message });
      }
    } catch {
      // If even the callback fails, the 5-minute lock expiry in
      // claim_sheets_sync_batch will free the rows anyway.
    }

    // 200, not 500: a failed sync is an expected operational state, not a
    // deployment error, and a 500 here would make Netlify's monitoring noisy
    // about something the queue already handles.
    return { statusCode: 200, body: JSON.stringify({ error: message }) };
  }
};
