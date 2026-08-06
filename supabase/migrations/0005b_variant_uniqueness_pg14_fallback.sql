-- =============================================================================
-- 0005b_variant_uniqueness_pg14_fallback.sql
--
-- DO NOT RUN unless the live database is PostgreSQL 14 or earlier.
--
-- Fallback Strategy for C-03 / D-290. `UNIQUE NULLS NOT DISTINCT` requires
-- PG 15+. This file reproduces the same semantics with an expression index.
--
-- Scope of the change: ONE constraint. No table structure, no column, no query
-- and no application code is affected.
--
-- Verify first:   select current_setting('server_version_num')::int >= 150000;
-- =============================================================================

alter table public.product_variants
  drop constraint if exists product_variants_combo_key;

-- The sentinel UUID stands in for "no colour" / "no size". It is deliberately
-- the nil UUID so it can never collide with a real generated key.
create unique index if not exists product_variants_combo_key
  on public.product_variants (
    product_id,
    coalesce(color_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(size_id,  '00000000-0000-0000-0000-000000000000'::uuid)
  );
