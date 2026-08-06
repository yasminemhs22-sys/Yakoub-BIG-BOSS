-- =============================================================================
-- 02_constraints_and_triggers.sql
--
-- Proves that invalid data is REJECTED and that the guards fire.
-- Every one of these protects against a failure that would otherwise be silent.
--
-- Runs inside a transaction and ROLLS BACK.
-- =============================================================================

begin;

delete from test.results;
select test.suite('03-constraints');
select test.build_fixture();

-- -----------------------------------------------------------------------------
-- C-03 / D-260 — the reason NULLS NOT DISTINCT exists.
-- Without it, PostgreSQL treats the two NULL size_ids as distinct and accepts
-- a duplicate one-size variant.
-- -----------------------------------------------------------------------------
select test.expect_error(
  'duplicate variant (colour + size) rejected',
  format('insert into public.product_variants (product_id, color_id, size_id)
          values (%L, %L, %L)', test.fx('product'), test.fx('color'), test.fx('size')),
  'duplicate'
);

select test.expect_error(
  'duplicate variant with NULL size rejected — NULLS NOT DISTINCT works',
  format('insert into public.product_variants (product_id, color_id, size_id)
          values (%L, %L, null)', test.fx('product'), test.fx('color')),
  'duplicate'
);

-- -----------------------------------------------------------------------------
-- Commune uniqueness must be per-wilaya, never global (D-280).
-- A global constraint would reject real homonym communes during seeding.
-- -----------------------------------------------------------------------------
do $$
declare v_w2 uuid; v_code smallint := 1;
begin
  while exists (select 1 from public.wilayas where code = v_code) loop
    v_code := v_code + 1;
  end loop;
  insert into public.wilayas (code, name_fr, name_ar)
  values (v_code, 'ZZTEST Wilaya 2', 'ولاية اختبار ٢') returning id into v_w2;

  begin
    insert into public.communes (wilaya_id, name_fr, name_ar)
    values (v_w2, 'ZZTEST Commune', 'بلدية اختبار');
    perform test.check('homonym commune accepted in a different wilaya', true);
  exception when others then
    perform test.check('homonym commune accepted in a different wilaya', false, sqlerrm);
  end;
end $$;

select test.expect_error(
  'duplicate commune within the SAME wilaya rejected',
  format('insert into public.communes (wilaya_id, name_fr, name_ar)
          values (%L, ''ZZTEST Commune'', ''اسم آخر'')', test.fx('wilaya')),
  'duplicate'
);

-- -----------------------------------------------------------------------------
-- Pricing
-- -----------------------------------------------------------------------------
select test.expect_error(
  'duplicate wilaya-level price for the same method rejected',
  format('insert into public.delivery_prices (wilaya_id, delivery_method_id, price)
          values (%L, %L, 999)', test.fx('wilaya'), test.fx('bureau')),
  'duplicate'
);

select test.expect_error(
  'negative delivery price rejected',
  format('insert into public.delivery_prices (wilaya_id, delivery_method_id, price)
          values (%L, %L, -1)', test.fx('wilaya'),
          (select id from public.delivery_methods where code = 'domicile'))
);

select test.expect_error(
  'commune override belonging to another wilaya rejected',
  format('insert into public.delivery_prices (wilaya_id, commune_id, delivery_method_id, price)
          select %L, c.id, %L, 500 from public.communes c
          where c.name_fr = ''ZZTEST Commune'' and c.wilaya_id <> %L limit 1',
          test.fx('wilaya'), test.fx('bureau'), test.fx('wilaya')),
  'does not belong'
);

-- Fee resolution
select test.eq('bureau fee resolves to 400',
  public.resolve_delivery_fee(test.fx('wilaya'), test.fx('commune'), test.fx('bureau')), 400::numeric);
select test.eq('domicile fee resolves to 700',
  public.resolve_delivery_fee(test.fx('wilaya'), test.fx('commune'), test.fx('domicile')), 700::numeric);

-- A commune override must outrank the wilaya price (D-034 forward compatibility)
do $$
begin
  insert into public.delivery_prices (wilaya_id, commune_id, delivery_method_id, price)
  values (test.fx('wilaya'), test.fx('commune'), test.fx('bureau'), 250);
  perform test.eq('commune override outranks wilaya price',
    public.resolve_delivery_fee(test.fx('wilaya'), test.fx('commune'), test.fx('bureau')), 250::numeric);
end $$;

-- -----------------------------------------------------------------------------
-- Products
-- -----------------------------------------------------------------------------
select test.expect_error(
  'sale price >= original price rejected',
  format('update public.products set sale_price = 5000 where id = %L', test.fx('product'))
);

select test.expect_ok(
  'sale price below original accepted',
  format('update public.products set sale_price = 2000 where id = %L', test.fx('product'))
);

select test.expect_ok(
  'sale price can be cleared',
  format('update public.products set sale_price = null where id = %L', test.fx('product'))
);

-- Publishing guards
do $$
declare v_p uuid;
begin
  insert into public.products (slug, name_fr, original_price)
  values ('zztest-empty', 'ZZTEST Empty', 1000) returning id into v_p;
  perform test.expect_error(
    'cannot publish a product with no images',
    format('update public.products set is_published = true where id = %L', v_p),
    'no images');
end $$;

-- Colour format
select test.expect_error('invalid hex colour rejected',
  'insert into public.colors (name_fr, hex_value) values (''ZZTEST Bad'', ''red'')');

-- -----------------------------------------------------------------------------
-- Featured image behaviour (D-272)
-- -----------------------------------------------------------------------------
select test.check('first image is featured automatically',
  (select is_featured from public.product_media where id = test.fx('product_media')));

do $$
declare v_m2 uuid; v_pm2 uuid;
begin
  insert into public.media (storage_path, mime_type)
  values ('zztest/img2.webp', 'image/webp') returning id into v_m2;
  insert into public.product_media (product_id, media_id, sort_order)
  values (test.fx('product'), v_m2, 1) returning id into v_pm2;

  perform test.check('second image is NOT featured',
    not (select is_featured from public.product_media where id = v_pm2));

  perform test.expect_error(
    'two featured images rejected',
    format('update public.product_media set is_featured = true where id = %L', v_pm2),
    'duplicate');

  -- Delete the featured one; the next by sort_order must be promoted.
  delete from public.product_media where id = test.fx('product_media');
  perform test.check('deleting the featured image promotes the next',
    (select is_featured from public.product_media where id = v_pm2));
end $$;

-- -----------------------------------------------------------------------------
-- Product ↔ category many-to-many (D-293)
-- -----------------------------------------------------------------------------
select test.check('first category assigned becomes primary automatically',
  (select is_primary from public.product_categories
   where product_id = test.fx('product') and category_id = test.fx('category')));

do $$
declare v_cat2 uuid;
begin
  insert into public.categories (slug, name_fr) values ('zztest-cat2', 'ZZTEST Cat 2')
  returning id into v_cat2;

  insert into public.product_categories (product_id, category_id, sort_order)
  values (test.fx('product'), v_cat2, 1);

  perform test.check('a product can belong to several categories',
    (select count(*) from public.product_categories where product_id = test.fx('product')) = 2);

  perform test.check('the second category is NOT primary',
    not (select is_primary from public.product_categories
         where product_id = test.fx('product') and category_id = v_cat2));

  perform test.expect_error('two primary categories rejected',
    format('update public.product_categories set is_primary = true
            where product_id = %L and category_id = %L', test.fx('product'), v_cat2),
    'duplicate');

  perform test.expect_error('the same category twice on one product rejected',
    format('insert into public.product_categories (product_id, category_id)
            values (%L, %L)', test.fx('product'), v_cat2),
    'duplicate');

  -- Removing the primary must promote the next, or breadcrumbs break silently.
  delete from public.product_categories
  where product_id = test.fx('product') and category_id = test.fx('category');

  perform test.check('removing the primary category promotes the next',
    (select is_primary from public.product_categories
     where product_id = test.fx('product') and category_id = v_cat2));
end $$;

-- Self-contained: the preceding block deletes the product<->category link while
-- testing primary promotion, so this test must create its own linked pair
-- rather than assume the fixture category is still in use.
do $$
declare v_c uuid; v_p uuid;
begin
  insert into public.categories (slug, name_fr) values ('zztest-restrict','ZZTEST Restrict')
  returning id into v_c;
  insert into public.products (slug, name_fr, original_price)
  values ('zztest-restrict-prod','ZZTEST Restrict Product', 1000) returning id into v_p;
  insert into public.product_categories (product_id, category_id) values (v_p, v_c);

  perform test.expect_error('deleting a category still in use is blocked',
    format('delete from public.categories where id = %L', v_c),
    'foreign key');
end $$;

-- -----------------------------------------------------------------------------
-- Category cycles — a loop makes every recursive query hang
-- -----------------------------------------------------------------------------
do $$
declare v_a uuid; v_b uuid;
begin
  insert into public.categories (slug, name_fr) values ('zztest-a', 'A') returning id into v_a;
  insert into public.categories (slug, name_fr, parent_id) values ('zztest-b', 'B', v_a) returning id into v_b;
  perform test.expect_error('category cycle rejected',
    format('update public.categories set parent_id = %L where id = %L', v_b, v_a),
    'cycle');
  perform test.expect_error('self-parent rejected',
    format('update public.categories set parent_id = %L where id = %L', v_a, v_a));
end $$;

-- -----------------------------------------------------------------------------
-- SKU generation (D-271)
-- -----------------------------------------------------------------------------
select test.check('SKU auto-generated on insert',
  (select sku from public.product_variants where id = test.fx('variant')) is not null,
  (select sku from public.product_variants where id = test.fx('variant')));

select test.check('auto SKU is uppercase and structured',
  (select sku from public.product_variants where id = test.fx('variant')) ~ '^[A-Z0-9-]+$');

do $$
declare v_sku text;
begin
  update public.product_variants
  set sku = 'ZZTEST-MANUAL-001', sku_is_custom = true
  where id = test.fx('variant2');
  select sku into v_sku from public.product_variants where id = test.fx('variant2');
  perform test.eq('manual SKU preserved', v_sku, 'ZZTEST-MANUAL-001');

  -- Regeneration must not overwrite a manual choice
  update public.product_variants set price_adjustment = 100 where id = test.fx('variant2');
  select sku into v_sku from public.product_variants where id = test.fx('variant2');
  perform test.eq('manual SKU survives an unrelated update', v_sku, 'ZZTEST-MANUAL-001');
end $$;

select test.expect_error('duplicate SKU rejected globally',
  format('update public.product_variants set sku = %L, sku_is_custom = true where id = %L',
    (select sku from public.product_variants where id = test.fx('variant')), test.fx('variant2')),
  'duplicate');

-- -----------------------------------------------------------------------------
-- Stock ledger is append-only (D-043)
-- -----------------------------------------------------------------------------
select test.eq('opening stock cached correctly',
  (select stock_on_hand from public.product_variants where id = test.fx('variant')), 5);

select test.expect_error('stock_movements UPDATE forbidden',
  format('update public.stock_movements set quantity_delta = 99 where variant_id = %L', test.fx('variant')),
  'append-only');

select test.expect_error('stock_movements DELETE forbidden',
  format('delete from public.stock_movements where variant_id = %L', test.fx('variant')),
  'append-only');

do $$
begin
  insert into public.stock_movements (variant_id, movement_type, quantity_delta, note)
  values (test.fx('variant'), 'restock', 3, 'ZZTEST restock');
  perform test.eq('restock updates the cached quantity',
    (select stock_on_hand from public.product_variants where id = test.fx('variant')), 8);
end $$;

select test.check('stock reconciliation reports consistency',
  (select bool_and(is_consistent) from public.stock_reconciliation()
   where variant_id in (test.fx('variant'), test.fx('variant2'))));

select test.expect_error('zero-quantity movement rejected',
  format('insert into public.stock_movements (variant_id, movement_type, quantity_delta)
          values (%L, ''restock'', 0)', test.fx('variant')));

-- -----------------------------------------------------------------------------
-- Last Super Admin guard — without it, one careless edit locks everyone out
-- -----------------------------------------------------------------------------
do $$
declare v_super uuid; v_count int;
begin
  select id into v_super from public.roles where code = 'super_admin';
  select count(*) into v_count from public.admin_users where role_id = v_super and is_active;

  if v_count = 1 then
    perform test.expect_error('cannot deactivate the last Super Admin',
      format('update public.admin_users set is_active = false where role_id = %L', v_super),
      'last active Super Admin');
  else
    perform test.check('last Super Admin guard — skipped',
      true, format('%s super admins exist; guard not exercised', v_count));
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Deletion paths (added after Phase 1 verification)
--
-- None of the original 210 assertions covered deleting an order or a product.
-- Every test file ends in ROLLBACK, so nothing was ever deleted explicitly, and
-- three real schema bugs hid behind that gap. These tests close it.
-- -----------------------------------------------------------------------------
do $$
declare v_res jsonb; v_order uuid; v_prod uuid; v_var uuid;
begin
  v_res := public.place_order('Delete','Target','0569100001',
             test.fx('wilaya'), test.fx('commune'), test.fx('bureau'), null, null,
             jsonb_build_array(jsonb_build_object('variant_id', test.fx('variant'),'quantity',1)));
  select id into v_order from public.orders where reference = v_res->>'reference';

  begin
    delete from public.orders where id = v_order;
    perform test.check('an order can be deleted (cascades into timeline and items)',
      not exists (select 1 from public.orders where id = v_order));
  exception when others then
    perform test.check('an order can be deleted (cascades into timeline and items)',
      false, left(sqlerrm, 140));
  end;

  -- A product carrying stock history must be deletable; the ledger survives.
  select product_id into v_prod from public.product_variants where id = test.fx('variant');
  v_var := test.fx('variant');
  begin
    delete from public.products where id = v_prod;
    perform test.check('a product with stock history can be deleted',
      not exists (select 1 from public.products where id = v_prod));
    perform test.check('its ledger rows survive with variant_id = null',
      exists (select 1 from public.stock_movements
              where variant_id is null and movement_type = 'initial'));
  exception when others then
    perform test.check('a product with stock history can be deleted', false, left(sqlerrm, 140));
  end;
end $$;

select * from test.report;
select * from test.summary;

rollback;
