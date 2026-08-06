-- =============================================================================
-- 00_harness.sql
--
-- RUN ONCE, AND COMMIT. Every other test file depends on this.
--
-- Creates a `test` schema with assertion helpers and fixture builders.
-- Nothing here touches production data.
--
-- Uninstall with 99_uninstall.sql when verification is finished.
-- =============================================================================

create schema if not exists test;

drop table if exists test.results cascade;
create table test.results (
  id       bigint generated always as identity primary key,
  suite    text not null,
  name     text not null,
  passed   boolean not null,
  detail   text,
  ran_at   timestamptz not null default now()
);

-- Current suite name, so individual checks do not have to repeat it.
create or replace function test.suite(p_name text)
returns void language plpgsql as $$
begin
  perform set_config('test.suite', p_name, true);
end $$;

-- -----------------------------------------------------------------------------
-- test.check — record a boolean assertion
-- -----------------------------------------------------------------------------
create or replace function test.check(p_name text, p_passed boolean, p_detail text default null)
returns boolean language plpgsql as $$
begin
  insert into test.results (suite, name, passed, detail)
  values (coalesce(current_setting('test.suite', true), 'general'),
          p_name, coalesce(p_passed, false), p_detail);
  return coalesce(p_passed, false);
end $$;

-- -----------------------------------------------------------------------------
-- test.eq — record an equality assertion, showing both values on failure
-- -----------------------------------------------------------------------------
create or replace function test.eq(p_name text, p_actual anyelement, p_expected anyelement)
returns boolean language plpgsql as $$
declare v_ok boolean := p_actual is not distinct from p_expected;
begin
  return test.check(
    p_name, v_ok,
    case when v_ok then null
         else format('expected %L, got %L', p_expected::text, p_actual::text) end
  );
end $$;

-- -----------------------------------------------------------------------------
-- test.expect_error — assert that a statement is REJECTED.
--
-- Most of this schema's safety lives in constraints and triggers, so proving
-- that invalid data is refused matters as much as proving valid data is stored.
-- p_contains optionally asserts on the error text.
-- -----------------------------------------------------------------------------
create or replace function test.expect_error(
  p_name text, p_sql text, p_contains text default null
)
returns boolean language plpgsql as $$
declare v_msg text;
begin
  begin
    execute p_sql;
  exception when others then
    v_msg := sqlerrm;
    if p_contains is null or position(lower(p_contains) in lower(v_msg)) > 0 then
      return test.check(p_name, true, 'rejected: ' || left(v_msg, 120));
    end if;
    return test.check(p_name, false,
      format('rejected, but message did not contain %L. Got: %s', p_contains, left(v_msg, 160)));
  end;
  return test.check(p_name, false, 'STATEMENT WAS ACCEPTED — it should have been rejected');
end $$;

-- -----------------------------------------------------------------------------
-- test.expect_ok — assert that a statement succeeds
-- -----------------------------------------------------------------------------
create or replace function test.expect_ok(p_name text, p_sql text)
returns boolean language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    return test.check(p_name, false, 'failed: ' || left(sqlerrm, 160));
  end;
  return test.check(p_name, true);
end $$;

-- -----------------------------------------------------------------------------
-- Fixture builder.
--
-- Everything it creates is prefixed ZZTEST so it is unmistakable in the admin
-- dashboard if a run is ever interrupted before rollback.
--
-- Wilaya code 58 is used because geography seeding is still pending; if real
-- geography has already been imported when you run this, change v_code below.
-- -----------------------------------------------------------------------------
create or replace function test.build_fixture()
returns jsonb language plpgsql as $$
declare
  v jsonb := '{}'::jsonb;
  v_wilaya uuid; v_commune uuid; v_bureau uuid; v_domicile uuid;
  v_cat uuid; v_prod uuid; v_color uuid; v_size uuid;
  v_media uuid; v_pmedia uuid; v_variant uuid; v_variant2 uuid;
  v_code smallint := 58;
begin
  while exists (select 1 from public.wilayas where code = v_code) and v_code > 1 loop
    v_code := v_code - 1;
  end loop;

  insert into public.wilayas (code, name_fr, name_ar)
  values (v_code, 'ZZTEST Wilaya', 'ولاية اختبار') returning id into v_wilaya;

  insert into public.communes (wilaya_id, name_fr, name_ar)
  values (v_wilaya, 'ZZTEST Commune', 'بلدية اختبار') returning id into v_commune;

  select id into v_bureau   from public.delivery_methods where code = 'bureau';
  select id into v_domicile from public.delivery_methods where code = 'domicile';

  insert into public.delivery_prices (wilaya_id, delivery_method_id, price)
  values (v_wilaya, v_bureau, 400), (v_wilaya, v_domicile, 700);

  insert into public.categories (slug, name_fr) values ('zztest-cat', 'ZZTEST Cat')
  returning id into v_cat;

  insert into public.colors (name_fr, hex_value) values ('ZZTEST Noir', '#000000')
  returning id into v_color;

  insert into public.sizes (label_fr, size_group) values ('ZZTEST-L', 'alpha')
  returning id into v_size;

  insert into public.products (slug, name_fr, original_price, sale_price)
  values ('zztest-product', 'ZZTEST Product', 3000, 2500)
  returning id into v_prod;

  insert into public.product_categories (product_id, category_id)
  values (v_prod, v_cat);

  insert into public.media (storage_path, mime_type)
  values ('zztest/img.webp', 'image/webp') returning id into v_media;

  insert into public.product_media (product_id, media_id, sort_order)
  values (v_prod, v_media, 0) returning id into v_pmedia;

  -- Variant A: colour + size. Variant B: colour only (size_id null) — the case
  -- that NULLS NOT DISTINCT exists to protect.
  insert into public.product_variants (product_id, color_id, size_id)
  values (v_prod, v_color, v_size) returning id into v_variant;

  insert into public.product_variants (product_id, color_id, size_id)
  values (v_prod, v_color, null) returning id into v_variant2;

  update public.products set is_published = true where id = v_prod;

  -- Opening stock: 5 units on variant A, 1 unit on variant B.
  insert into public.stock_movements (variant_id, movement_type, quantity_delta, note)
  values (v_variant, 'initial', 5, 'ZZTEST opening'),
         (v_variant2, 'initial', 1, 'ZZTEST opening');

  v := jsonb_build_object(
    'wilaya', v_wilaya, 'commune', v_commune,
    'bureau', v_bureau, 'domicile', v_domicile,
    'category', v_cat, 'product', v_prod, 'color', v_color, 'size', v_size,
    'media', v_media, 'product_media', v_pmedia,
    'variant', v_variant, 'variant2', v_variant2
  );
  perform set_config('test.fixture', v::text, true);
  return v;
end $$;

create or replace function test.fx(p_key text)
returns uuid language sql stable as $$
  select (current_setting('test.fixture', true)::jsonb ->> p_key)::uuid
$$;

-- -----------------------------------------------------------------------------
-- Report
-- -----------------------------------------------------------------------------
create or replace view test.report as
  select suite, name,
         case when passed then 'PASS' else 'FAIL' end as result,
         detail
  from test.results
  order by id;

create or replace view test.summary as
  select suite,
         count(*) filter (where passed)     as passed,
         count(*) filter (where not passed) as failed,
         count(*)                           as total
  from test.results
  group by suite
  order by suite;

select 'Harness installed. Run 01 … 05 next.' as status;
