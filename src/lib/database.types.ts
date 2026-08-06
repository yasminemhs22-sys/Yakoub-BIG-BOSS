/**
 * PLACEHOLDER — replace with generated types.
 *
 *   npx supabase login
 *   npx supabase link --project-ref <your-project-ref>
 *   npx supabase gen types typescript --linked > src/lib/database.types.ts
 *
 * WHY THIS IS `any` AND NOT A HAND-WRITTEN SHAPE
 *
 * An earlier version of this file described the tables and RPC signatures by
 * hand. supabase-js resolves table and function types by exact lookup, and a
 * generic index signature does not satisfy it — every table collapsed to
 * `never`, which rejects every field, and every RPC argument became
 * `undefined`. Twenty-eight errors, one cause.
 *
 * A placeholder should be honestly untyped rather than convincingly wrong.
 * `any` means "not typed yet", which is true, and it disappears entirely the
 * moment the real types are generated from your own schema.
 *
 * Regenerate after every migration. A stale types file is worse than none,
 * because it lies with confidence.
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Database = any;

/**
 * The one shape worth keeping by hand.
 *
 * `my_profile()` decides whether someone may enter the dashboard at all, so its
 * result is used in enough places that an accidental typo should be a compile
 * error rather than a runtime surprise.
 */
export interface AdminProfileRow {
  id: string;
  full_name: string;
  email: string;
  is_active: boolean;
  role_code: string;
  role_name_fr: string;
  role_name_ar: string;
}
