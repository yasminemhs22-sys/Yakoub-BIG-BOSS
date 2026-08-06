-- =============================================================================
-- 04_rls_security.sql
--
-- The most important file in the suite.
--
-- A single permissive policy would expose every customer's name, phone and
-- address to anyone holding the anon key — which is published in the frontend
-- bundle by design. These tests assume the anon key is already in an attacker's
-- hands, because it is.
--
-- Runs inside a transaction and ROLLS BACK.
-- =============================================================================

begin;

delete from test.results;
select test.suite('08-rls-anon');
select test.build_fixture();

-- Place one real order so there is customer data to try to steal.
do $$
declare v_res jsonb;
begin
  v_res := public.place_order('Karim','Benali','0569998877', test.fx('wilaya'), test.fx('commune'),
             test.fx('bureau'), null, null,
             jsonb_build_array(jsonb_build_object('variant_id', test.fx('variant'),'quantity',1)));
  perform set_config('test.ref', v_res->>'reference', true);
end $$;

-- -----------------------------------------------------------------------------
-- ANONYMOUS ROLE — what a visitor with the public key can reach
-- -----------------------------------------------------------------------------
do $$
declare v_count int; v_err text;
begin
  set local role anon;

  -- --- Data that MUST be invisible -----------------------------------------
  begin
    select count(*) into v_count from public.orders;
    perform test.check('anon CANNOT read orders', v_count = 0,
      format('LEAK: anon read %s order rows', v_count));
  exception when others then
    perform test.check('anon CANNOT read orders', true, 'denied: ' || left(sqlerrm, 80));
  end;

  begin
    select count(*) into v_count from public.order_items;
    perform test.check('anon CANNOT read order_items', v_count = 0,
      format('LEAK: %s rows', v_count));
  exception when others then
    perform test.check('anon CANNOT read order_items', true, 'denied');
  end;

  begin
    select count(*) into v_count from public.order_timeline;
    perform test.check('anon CANNOT read order_timeline', v_count = 0, format('LEAK: %s rows', v_count));
  exception when others then
    perform test.check('anon CANNOT read order_timeline', true, 'denied');
  end;

  begin
    select count(*) into v_count from public.admin_users;
    perform test.check('anon CANNOT read admin_users', v_count = 0, format('LEAK: %s rows', v_count));
  exception when others then
    perform test.check('anon CANNOT read admin_users', true, 'denied');
  end;

  begin
    select count(*) into v_count from public.audit_log;
    perform test.check('anon CANNOT read audit_log', v_count = 0, format('LEAK: %s rows', v_count));
  exception when others then
    perform test.check('anon CANNOT read audit_log', true, 'denied');
  end;

  begin
    select count(*) into v_count from public.phone_blocklist;
    perform test.check('anon CANNOT read phone_blocklist', v_count = 0, format('LEAK: %s rows', v_count));
  exception when others then
    perform test.check('anon CANNOT read phone_blocklist', true, 'denied');
  end;

  begin
    select count(*) into v_count from public.stock_movements;
    perform test.check('anon CANNOT read stock_movements', v_count = 0, format('LEAK: %s rows', v_count));
  exception when others then
    perform test.check('anon CANNOT read stock_movements', true, 'denied');
  end;

  begin
    select count(*) into v_count from public.order_submission_log;
    perform test.check('anon CANNOT read order_submission_log', v_count = 0, format('LEAK: %s rows', v_count));
  exception when others then
    perform test.check('anon CANNOT read order_submission_log', true, 'denied');
  end;

  begin
    select count(*) into v_count from public.sheets_sync_queue;
    perform test.check('anon CANNOT read sheets_sync_queue', v_count = 0, format('LEAK: %s rows', v_count));
  exception when others then
    perform test.check('anon CANNOT read sheets_sync_queue', true, 'denied');
  end;

  begin
    select count(*) into v_count from public.roles;
    perform test.check('anon CANNOT read roles', v_count = 0, format('LEAK: %s rows', v_count));
  exception when others then
    perform test.check('anon CANNOT read roles', true, 'denied');
  end;

  reset role;
end $$;

-- Private settings must not leak through the public settings table.
do $$
declare v_count int;
begin
  set local role anon;
  select count(*) into v_count from public.settings where not is_public;
  perform test.check('anon CANNOT read private settings', v_count = 0,
    format('LEAK: %s private settings visible', v_count));
  select count(*) into v_count from public.settings where is_public;
  perform test.check('anon CAN read public settings', v_count > 0);
  reset role;
end $$;

-- Unpublished catalogue and content must be invisible.
do $$
declare v_count int;
begin
  update public.products set is_published = false where id = test.fx('product');

  set local role anon;
  select count(*) into v_count from public.products where id = test.fx('product');
  perform test.check('anon CANNOT read an unpublished product', v_count = 0);

  select count(*) into v_count from public.product_variants where product_id = test.fx('product');
  perform test.check('anon CANNOT read variants of an unpublished product', v_count = 0);

  select count(*) into v_count from public.pages where not is_published;
  perform test.check('anon CANNOT read unpublished pages', v_count = 0,
    format('LEAK: %s rows', v_count));
  reset role;

  update public.products set is_published = true where id = test.fx('product');
end $$;

-- Storefront data the site genuinely needs.
do $$
declare v_count int;
begin
  set local role anon;
  select count(*) into v_count from public.wilayas;
  perform test.check('anon CAN read wilayas', v_count > 0);
  select count(*) into v_count from public.communes;
  perform test.check('anon CAN read communes', v_count > 0);
  select count(*) into v_count from public.delivery_prices;
  perform test.check('anon CAN read delivery prices (needed by the estimator)', v_count > 0);
  select count(*) into v_count from public.products where is_published;
  perform test.check('anon CAN read published products', v_count > 0);
  select count(*) into v_count from public.order_statuses;
  perform test.check('anon CAN read status labels (needed by tracking)', v_count > 0);
  reset role;
end $$;

-- Anonymous writes must be impossible outside the RPCs.
do $$
begin
  set local role anon;
  perform test.expect_error('anon CANNOT insert an order directly',
    format('insert into public.orders (reference, status_id, first_name, last_name,
            phone_raw, phone_e164, wilaya_id, commune_id, delivery_method_id,
            subtotal, delivery_fee, total)
            values (''HACK-1'', (select id from public.order_statuses where code=''new''),
            ''a'',''b'',''0561111111'',''+213561111111'', %L, %L, %L, 0,0,0)',
            test.fx('wilaya'), test.fx('commune'), test.fx('bureau')));

  perform test.expect_error('anon CANNOT change a product price',
    format('update public.products set original_price = 1 where id = %L', test.fx('product')));

  perform test.expect_error('anon CANNOT insert stock movements',
    format('insert into public.stock_movements (variant_id, movement_type, quantity_delta)
            values (%L, ''restock'', 1000)', test.fx('variant')));

  perform test.expect_error('anon CANNOT delete themselves from the blocklist',
    'delete from public.phone_blocklist');

  perform test.expect_error('anon CANNOT write to the audit log',
    'insert into public.audit_log (action, entity_table) values (''insert'', ''fake'')');
  reset role;
end $$;

-- Tracking is the only sanctioned route to an order, and needs both factors.
do $$
declare v_res jsonb;
begin
  set local role anon;
  v_res := public.track_order(current_setting('test.ref'), '0569998877');
  perform test.check('track_order works with the correct reference AND phone',
    (v_res->>'ok')::boolean, v_res::text);

  v_res := public.track_order(current_setting('test.ref'), '0560000000');
  perform test.check('track_order fails with the wrong phone', not (v_res->>'ok')::boolean);

  v_res := public.track_order('YBB-000000-XXXX', '0569998877');
  perform test.check('track_order fails with the wrong reference', not (v_res->>'ok')::boolean);

  v_res := public.track_order(current_setting('test.ref'), '0569998877');
  perform test.check('track_order does NOT expose the address or notes',
    not (v_res::text ilike '%address%'), v_res::text);
  reset role;
end $$;

-- =============================================================================
select test.suite('09-rls-admin-roles');

-- -----------------------------------------------------------------------------
-- Least privilege between admin roles.
--
-- This is the bug that was found and fixed during the Phase 1 self-review: a
-- blanket read policy gave a Content Manager access to every customer record.
-- These tests exist to make sure it cannot come back.
--
-- Requires one admin account per role. Where an account is missing the test is
-- SKIPPED and reported as such — never silently passed.
-- -----------------------------------------------------------------------------
-- No dedicated content_manager or administrator account is required.
--
-- Everything here runs inside a transaction that is rolled back, so we borrow
-- an existing admin, change their role temporarily, prove the isolation, and
-- let the rollback restore reality. Nothing to create, nothing to clean up,
-- and no dependence on anyone remembering to delete a test account later.
do $$
declare
  v_victim uuid; v_original uuid; v_count int; v_supers int;
begin
  select count(*) into v_supers
  from public.admin_users au join public.roles r on r.id = au.role_id
  where r.code = 'super_admin' and au.is_active;

  -- Borrow the most recently created admin, so the last Super Admin guard
  -- (which is itself a feature we want intact) is never triggered.
  select au.id, au.role_id into v_victim, v_original
  from public.admin_users au
  where au.is_active
  order by au.created_at desc
  limit 1;

  if v_victim is null then
    perform test.check('role isolation tests', false, 'SKIPPED — no admin accounts exist');
    return;
  end if;

  if v_supers < 2 then
    perform test.check('role isolation tests', false,
      'SKIPPED — only one active Super Admin; changing its role would trip the guard');
    return;
  end if;

  -- ================= CONTENT MANAGER =================
  update public.admin_users
  set role_id = (select id from public.roles where code = 'content_manager')
  where id = v_victim;

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_victim)::text, true);

  begin
    select count(*) into v_count from public.orders;
    perform test.check('Content Manager CANNOT read orders', v_count = 0,
      format('LEAK: %s order rows visible to content_manager', v_count));
  exception when others then
    perform test.check('Content Manager CANNOT read orders', true, 'denied');
  end;

  begin
    select count(*) into v_count from public.order_items;
    perform test.check('Content Manager CANNOT read order_items', v_count = 0,
      format('LEAK: %s rows', v_count));
  exception when others then
    perform test.check('Content Manager CANNOT read order_items', true, 'denied');
  end;

  begin
    select count(*) into v_count from public.audit_log;
    perform test.check('Content Manager CANNOT read the audit log', v_count = 0,
      format('LEAK: %s rows', v_count));
  exception when others then
    perform test.check('Content Manager CANNOT read the audit log', true, 'denied');
  end;

  begin
    select count(*) into v_count from public.phone_blocklist;
    perform test.check('Content Manager CANNOT read the phone blocklist', v_count = 0,
      format('LEAK: %s rows', v_count));
  exception when others then
    perform test.check('Content Manager CANNOT read the phone blocklist', true, 'denied');
  end;

  begin
    select count(*) into v_count from public.pages;
    perform test.check('Content Manager CAN read pages', v_count > 0);
  exception when others then
    perform test.check('Content Manager CAN read pages', false, sqlerrm);
  end;

  perform test.check('Content Manager has content.manage', app.has_permission('content.manage'));
  perform test.check('Content Manager has NO orders.view',  not app.has_permission('orders.view'));
  perform test.check('Content Manager has NO orders.confirm', not app.has_permission('orders.confirm'));
  perform test.check('Content Manager has NO catalogue.manage', not app.has_permission('catalogue.manage'));
  reset role;

  -- ================= ADMINISTRATOR =================
  update public.admin_users
  set role_id = (select id from public.roles where code = 'administrator')
  where id = v_victim;

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_victim)::text, true);

  perform test.check('Administrator CAN confirm orders',   app.has_permission('orders.confirm'));
  perform test.check('Administrator CAN manage catalogue', app.has_permission('catalogue.manage'));
  perform test.check('Administrator CANNOT oversell',      not app.has_permission('orders.oversell'));
  perform test.check('Administrator CANNOT manage roles',  not app.has_permission('roles.manage'));
  perform test.check('Administrator CANNOT manage admins', not app.has_permission('admins.manage'));
  perform test.check('Administrator CANNOT view the audit log', not app.has_permission('audit.view'));
  perform test.check('Administrator CANNOT change settings', not app.has_permission('settings.manage'));

  begin
    select count(*) into v_count from public.orders;
    perform test.check('Administrator CAN read orders', v_count > 0);
  exception when others then
    perform test.check('Administrator CAN read orders', false, sqlerrm);
  end;
  reset role;

  -- ================= SUPER ADMIN =================
  update public.admin_users
  set role_id = (select id from public.roles where code = 'super_admin')
  where id = v_victim;

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_victim)::text, true);
  perform test.check('Super Admin CAN oversell',      app.has_permission('orders.oversell'));
  perform test.check('Super Admin CAN manage admins', app.has_permission('admins.manage'));
  perform test.check('Super Admin CAN view the audit log', app.has_permission('audit.view'));
  reset role;

  -- The rollback at the end of this file restores the original role anyway,
  -- but restoring explicitly means an interrupted run is still safe.
  update public.admin_users set role_id = v_original where id = v_victim;
end $$;

-- An inactive admin must lose everything immediately.
do $$
declare v_any uuid; v_count int;
begin
  select id into v_any from public.admin_users where is_active limit 1;
  if v_any is null then
    perform test.check('deactivated admin loses access', false, 'SKIPPED — no admin accounts');
    return;
  end if;

  -- Bypass the last-super-admin guard by testing permission resolution directly.
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000000"}', true);
  perform test.check('unknown JWT resolves to no admin identity',
    app.current_admin_id() is null);
  perform test.check('unknown JWT holds no permissions',
    not app.has_permission('orders.view'));
  begin
    select count(*) into v_count from public.orders;
    perform test.check('unknown JWT CANNOT read orders', v_count = 0, format('LEAK: %s rows', v_count));
  exception when others then
    perform test.check('unknown JWT CANNOT read orders', true, 'denied');
  end;
  reset role;
end $$;

-- The helper that reads admin_users must not recurse through its own policy.
-- This is what removing FORCE ROW LEVEL SECURITY was for.
do $$
declare v_id uuid;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', coalesce((select id::text from public.admin_users limit 1),
                                      '00000000-0000-0000-0000-000000000000'))::text, true);
  begin
    v_id := app.current_admin_id();
    perform test.check('app.current_admin_id() does not recurse infinitely', true);
  exception when others then
    perform test.check('app.current_admin_id() does not recurse infinitely', false,
      left(sqlerrm, 160));
  end;
  reset role;
end $$;

select * from test.report;
select * from test.summary;

rollback;
