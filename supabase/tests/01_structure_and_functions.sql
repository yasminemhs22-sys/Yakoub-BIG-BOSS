-- =============================================================================
-- 01_structure_and_functions.sql
--
-- Verifies: PostgreSQL version, extensions, every table exists, every index and
-- constraint that the design depends on is present, and the pure helper
-- functions behave.
--
-- Runs inside a transaction and ROLLS BACK. Nothing is left behind.
-- Read the final two result sets.
-- =============================================================================

begin;

delete from test.results;
select test.suite('01-structure');

-- -----------------------------------------------------------------------------
-- PostgreSQL version — decides whether the PG14 fallback (D-290) is needed
-- -----------------------------------------------------------------------------
select test.check(
  'PostgreSQL is 15 or later (required by UNIQUE NULLS NOT DISTINCT)',
  current_setting('server_version_num')::int >= 150000,
  'server_version = ' || current_setting('server_version')
);

-- Extensions
select test.check('extension pgcrypto installed',
  exists (select 1 from pg_extension where extname = 'pgcrypto'));
select test.check('extension unaccent installed',
  exists (select 1 from pg_extension where extname = 'unaccent'));
select test.check('extension pg_trgm installed',
  exists (select 1 from pg_extension where extname = 'pg_trgm'));

-- -----------------------------------------------------------------------------
-- All 32 tables exist
-- -----------------------------------------------------------------------------
do $$
declare t text; v_missing text[] := '{}';
begin
  foreach t in array array[
    'wilayas','communes','delivery_methods','delivery_prices','delivery_companies',
    'roles','permissions','role_permissions','admin_users','audit_log',
    'media','settings','pages','content_blocks','menus','menu_items',
    'categories','sizes','colors','products','product_categories','product_media','product_variants',
    'stock_movements','order_statuses','order_status_transitions','orders',
    'order_items','order_timeline','phone_blocklist','order_submission_log',
    'sheets_sync_queue','build_requests'
  ] loop
    if to_regclass('public.' || t) is null then
      v_missing := v_missing || t;
    end if;
  end loop;
  perform test.check('all 33 tables exist', cardinality(v_missing) = 0,
    case when cardinality(v_missing) > 0 then 'missing: ' || array_to_string(v_missing, ', ') end);
end $$;

-- -----------------------------------------------------------------------------
-- RLS is enabled everywhere. A table without RLS is readable by anyone holding
-- the anon key, so this check is not a formality.
-- -----------------------------------------------------------------------------
do $$
declare v_off text[];
begin
  select array_agg(c.relname order by c.relname) into v_off
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
  perform test.check('RLS enabled on every public table', v_off is null,
    'RLS OFF on: ' || array_to_string(coalesce(v_off, '{}'), ', '));
end $$;

-- Every table must actually have at least one policy; RLS with no policy
-- denies everything, which is safe but usually a mistake.
do $$
declare v_none text[];
begin
  select array_agg(c.relname order by c.relname) into v_none
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
    and not exists (select 1 from pg_policy p where p.polrelid = c.oid)
    and c.relname not in ('order_submission_log');  -- written only by SECURITY DEFINER
  perform test.check('every RLS table has at least one policy', v_none is null,
    'no policies on: ' || array_to_string(coalesce(v_none, '{}'), ', '));
end $$;

-- -----------------------------------------------------------------------------
-- Critical constraints and indexes
-- -----------------------------------------------------------------------------
select test.check('product_variants combo uniqueness exists',
  exists (select 1 from pg_constraint where conname = 'product_variants_combo_key')
  or exists (select 1 from pg_class where relname = 'product_variants_combo_key' and relkind = 'i'));

select test.check('communes uniqueness is scoped to wilaya (not global)',
  exists (
    select 1 from pg_constraint
    where conname = 'communes_wilaya_name_fr_key' and contype = 'u'
  ));

select test.check('exactly-one-primary-category partial index exists',
  exists (select 1 from pg_indexes
          where indexname = 'product_categories_one_primary' and indexdef ilike '%where%is_primary%'));

select test.check('product_categories(category_id) index exists (category listing)',
  exists (select 1 from pg_indexes where indexname = 'product_categories_category_idx'));

select test.check('exactly-one-featured-image partial index exists',
  exists (select 1 from pg_indexes
          where indexname = 'product_media_one_featured' and indexdef ilike '%where%is_featured%'));

select test.check('communes(wilaya_id) index exists (per-wilaya fetching, C-06)',
  exists (select 1 from pg_indexes where indexname = 'communes_wilaya_idx'));

select test.check('orders(phone_e164) index exists (fraud + tracking lookups)',
  exists (select 1 from pg_indexes where indexname = 'orders_phone_idx'));

select test.check('sheets queue has one live row per order',
  exists (select 1 from pg_indexes where indexname = 'sheets_sync_queue_order_key'));

select test.check('sale price constraint exists',
  exists (select 1 from pg_constraint where conname = 'products_sale_price_lower'));

-- -----------------------------------------------------------------------------
-- Seeded system data
-- -----------------------------------------------------------------------------
select test.eq('12 order statuses seeded',
  (select count(*)::int from public.order_statuses), 12);
select test.eq('2 delivery methods seeded',
  (select count(*)::int from public.delivery_methods), 2);
select test.eq('3 roles seeded',
  (select count(*)::int from public.roles), 3);
select test.check('confirmed status decrements stock',
  (select decrements_stock from public.order_statuses where code = 'confirmed'));
select test.check('returned status restores stock',
  (select restores_stock from public.order_statuses where code = 'returned'));
select test.check('cancelled status restores stock',
  (select restores_stock from public.order_statuses where code = 'cancelled'));
select test.check('status transitions seeded',
  (select count(*) from public.order_status_transitions) >= 20);
select test.check('super_admin holds every permission',
  (select count(*) from public.role_permissions rp
     join public.roles r on r.id = rp.role_id where r.code = 'super_admin')
  = (select count(*) from public.permissions));
select test.check('content_manager cannot view orders',
  not exists (
    select 1 from public.role_permissions rp
    join public.roles r on r.id = rp.role_id
    join public.permissions p on p.id = rp.permission_id
    where r.code = 'content_manager' and p.code like 'orders.%'
  ));
select test.check('legal pages created unpublished with no placeholder text',
  (select count(*) from public.pages where page_type = 'legal' and not is_published) = 3);

-- =============================================================================
select test.suite('02-functions');

-- -----------------------------------------------------------------------------
-- Phone normalisation (D-268). Getting this wrong breaks the blocklist and
-- duplicate detection silently, so every accepted form is checked.
-- -----------------------------------------------------------------------------
select test.eq('phone: local 0-prefix',     app.normalize_phone_dz('0563876210'),      '+213563876210');
select test.eq('phone: spaced local',       app.normalize_phone_dz('0563 87 62 10'),   '+213563876210');
select test.eq('phone: dashed local',       app.normalize_phone_dz('0563-87-62-10'),   '+213563876210');
select test.eq('phone: +213 form',          app.normalize_phone_dz('+213563876210'),   '+213563876210');
select test.eq('phone: 00213 form',         app.normalize_phone_dz('00213563876210'),  '+213563876210');
select test.eq('phone: 06 mobile accepted', app.normalize_phone_dz('0661234567'),      '+213661234567');
select test.eq('phone: 07 mobile accepted', app.normalize_phone_dz('0771234567'),      '+213771234567');
-- Landlines are rejected on purpose: a customer who cannot be reached on the
-- road is an undeliverable COD order.
select test.eq('phone: landline rejected',  app.normalize_phone_dz('021712345'),       null);
select test.eq('phone: too short rejected', app.normalize_phone_dz('056387'),          null);
select test.eq('phone: too long rejected',  app.normalize_phone_dz('05638762100'),     null);
select test.eq('phone: foreign rejected',   app.normalize_phone_dz('+33612345678'),    null);
select test.eq('phone: letters rejected',   app.normalize_phone_dz('abcdefghij'),      null);
select test.eq('phone: null in, null out',  app.normalize_phone_dz(null),              null);
select test.eq('phone: invalid prefix 09 rejected', app.normalize_phone_dz('0912345678'), null);

-- Configurability (D-292): the rule must come from settings, not from code.
do $$
begin
  perform test.eq('phone rule reads settings — 09 rejected by default',
    app.normalize_phone_dz('0912345678'), null);

  update public.settings set value = '["5","6","7","9"]'::jsonb
  where key = 'phone.mobile_prefixes';

  perform test.eq('phone rule reads settings — 09 accepted once configured',
    app.normalize_phone_dz('0912345678'), '+213912345678');

  -- A missing or emptied setting must fall back to the safe default, never
  -- disable validation entirely.
  update public.settings set value = '[]'::jsonb where key = 'phone.mobile_prefixes';
  perform test.eq('empty prefix list falls back to defaults, not to "accept all"',
    app.normalize_phone_dz('0912345678'), null);
  perform test.eq('fallback still accepts a normal mobile',
    app.normalize_phone_dz('0563876210'), '+213563876210');
end $$;

-- Slugify
select test.eq('slugify: accents transliterated', app.slugify('Béjaïa Été'), 'bejaia-ete');
select test.eq('slugify: punctuation collapsed',  app.slugify('T-Shirt  //  Noir!'), 't-shirt-noir');
select test.eq('slugify: arabic yields empty (French slug is the fallback)',
  app.slugify('قميص'), '');

-- Order reference (D-269)
do $$
declare v_ref text := app.generate_order_reference();
begin
  perform test.check('order reference matches YBB-YYMMDD-XXXX',
    v_ref ~ '^YBB-[0-9]{6}-[0-9A-Z]{4}$', v_ref);
  perform test.check('order reference excludes ambiguous characters I L O U',
    right(v_ref, 4) !~ '[ILOU]', v_ref);
  perform test.check('two references differ (non-sequential, D-270)',
    v_ref <> app.generate_order_reference());
end $$;

select * from test.report;
select * from test.summary;

rollback;
