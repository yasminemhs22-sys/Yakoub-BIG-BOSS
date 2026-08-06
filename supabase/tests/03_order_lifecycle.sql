-- =============================================================================
-- 03_order_lifecycle.sql
--
-- The full commercial cycle: place -> confirm -> prepare -> ship -> deliver
-- -> collect cash, plus the return path and the fake-order path.
--
-- Also proves the two rules that protect the business:
--   * placing an order NEVER reserves stock (D-041)
--   * a failing Sheets sync NEVER blocks confirmation (D-155)
--
-- Runs inside a transaction and ROLLS BACK.
-- =============================================================================

begin;

delete from test.results;
select test.suite('04-lifecycle');
select test.build_fixture();

-- An admin identity is required for confirm_order(). We impersonate the first
-- active Super Admin. If none exists yet, the RPC tests are skipped and clearly
-- reported rather than silently passing.
do $$
declare v_admin uuid;
begin
  select au.id into v_admin
  from public.admin_users au join public.roles r on r.id = au.role_id
  where r.code = 'super_admin' and au.is_active
  limit 1;
  perform set_config('test.admin', coalesce(v_admin::text, ''), true);
  perform test.check('an active Super Admin exists for RPC tests',
    v_admin is not null,
    case when v_admin is null
      then 'Create one admin account first, then re-run. RPC tests below are skipped.' end);
end $$;

-- -----------------------------------------------------------------------------
-- PLACE ORDER  (anonymous path)
-- -----------------------------------------------------------------------------
do $$
declare v_res jsonb; v_order uuid; v_stock_before int; v_stock_after int;
begin
  select stock_on_hand into v_stock_before
  from public.product_variants where id = test.fx('variant');

  v_res := public.place_order(
    p_first_name => 'Amine', p_last_name => 'Bouzid',
    p_phone      => '0561234567',
    p_wilaya_id  => test.fx('wilaya'),
    p_commune_id => test.fx('commune'),
    p_method_id  => test.fx('bureau'),
    p_items      => jsonb_build_array(
                      jsonb_build_object('variant_id', test.fx('variant'), 'quantity', 2))
  );

  perform test.check('order placed successfully', (v_res->>'ok')::boolean, v_res::text);
  perform test.check('reference returned in YBB format',
    (v_res->>'reference') ~ '^YBB-[0-9]{6}-[0-9A-Z]{4}$', v_res->>'reference');

  select id into v_order from public.orders where reference = v_res->>'reference';
  perform set_config('test.order', v_order::text, true);

  -- Totals must be computed server-side (D-274): 2 x 2500 + 400 bureau fee.
  perform test.eq('subtotal computed server-side',
    (select subtotal from public.orders where id = v_order), 5000::numeric);
  perform test.eq('delivery fee resolved server-side',
    (select delivery_fee from public.orders where id = v_order), 400::numeric);
  perform test.eq('total = subtotal + fee',
    (select total from public.orders where id = v_order), 5400::numeric);

  perform test.eq('phone stored in canonical E.164 form',
    (select phone_e164 from public.orders where id = v_order), '+213561234567');
  perform test.eq('raw phone preserved for audit',
    (select phone_raw from public.orders where id = v_order), '0561234567');

  -- THE core inventory rule.
  select stock_on_hand into v_stock_after
  from public.product_variants where id = test.fx('variant');
  perform test.eq('placing an order does NOT reserve stock (D-041)',
    v_stock_after, v_stock_before);

  perform test.eq('order starts in status "new"',
    (select st.code from public.orders o join public.order_statuses st on st.id = o.status_id
     where o.id = v_order), 'new');

  perform test.check('timeline records the placement',
    exists (select 1 from public.order_timeline
            where order_id = v_order and event_type = 'order_placed'));

  -- Snapshot must be independent of the catalogue (D-057).
  perform test.eq('line item snapshots the product name',
    (select product_name_fr from public.order_items where order_id = v_order), 'ZZTEST Product');
  perform test.eq('line item snapshots the unit price',
    (select unit_price from public.order_items where order_id = v_order), 2500::numeric);
end $$;

-- Changing the catalogue must not alter a placed order.
do $$
begin
  update public.products
  set name_fr = 'ZZTEST Renamed', original_price = 9999, sale_price = null
  where id = test.fx('product');

  perform test.eq('renaming the product does NOT change the order snapshot',
    (select product_name_fr from public.order_items
     where order_id = current_setting('test.order')::uuid), 'ZZTEST Product');
  perform test.eq('repricing the product does NOT change the order total',
    (select total from public.orders where id = current_setting('test.order')::uuid), 5400::numeric);
end $$;

-- -----------------------------------------------------------------------------
-- Validation and anti-fraud on the public path
-- -----------------------------------------------------------------------------
do $$
declare v_res jsonb;
begin
  -- Honeypot must look like success while storing nothing (bots learn nothing).
  v_res := public.place_order('Bot','Bot','0561111111', test.fx('wilaya'), test.fx('commune'),
             test.fx('bureau'), null, null,
             jsonb_build_array(jsonb_build_object('variant_id', test.fx('variant'),'quantity',1)),
             'i-am-a-bot');
  perform test.check('honeypot returns a fake success', (v_res->>'ok')::boolean);
  perform test.check('honeypot stores no order',
    not exists (select 1 from public.orders where phone_e164 = '+213561111111'));

  -- Invalid phone
  v_res := public.place_order('X','Y','12345', test.fx('wilaya'), test.fx('commune'),
             test.fx('bureau'), null, null,
             jsonb_build_array(jsonb_build_object('variant_id', test.fx('variant'),'quantity',1)));
  perform test.eq('invalid phone rejected', v_res->>'reason', 'invalid_phone');

  -- Empty cart
  v_res := public.place_order('X','Y','0562222222', test.fx('wilaya'), test.fx('commune'),
             test.fx('bureau'), null, null, '[]'::jsonb);
  perform test.eq('empty cart rejected', v_res->>'reason', 'invalid_cart');

  -- Duplicate submission within 2 minutes
  v_res := public.place_order('Amine','Bouzid','0561234567', test.fx('wilaya'), test.fx('commune'),
             test.fx('bureau'), null, null,
             jsonb_build_array(jsonb_build_object('variant_id', test.fx('variant'),'quantity',1)));
  perform test.eq('duplicate submission blocked', v_res->>'reason', 'duplicate_submission');
end $$;

-- Home delivery requires an address (D-240)
do $$
declare v_res jsonb;
begin
  begin
    v_res := public.place_order('Sans','Adresse','0563333333', test.fx('wilaya'), test.fx('commune'),
               test.fx('domicile'), null, null,
               jsonb_build_array(jsonb_build_object('variant_id', test.fx('variant'),'quantity',1)));
    perform test.check('home delivery without an address rejected', false,
      'accepted: ' || v_res::text);
  exception when others then
    perform test.check('home delivery without an address rejected', true, left(sqlerrm, 100));
  end;
end $$;

-- Commune must belong to the selected wilaya
do $$
declare v_res jsonb; v_other uuid; v_code smallint := 1;
begin
  while exists (select 1 from public.wilayas where code = v_code) loop v_code := v_code + 1; end loop;
  insert into public.wilayas (code, name_fr, name_ar) values (v_code, 'ZZTEST W3','و٣')
  returning id into v_other;
  insert into public.communes (wilaya_id, name_fr, name_ar) values (v_other, 'ZZTEST C3','ب٣');

  begin
    v_res := public.place_order('Bad','Geo','0564444444', test.fx('wilaya'),
               (select id from public.communes where name_fr = 'ZZTEST C3'),
               test.fx('bureau'), null, null,
               jsonb_build_array(jsonb_build_object('variant_id', test.fx('variant'),'quantity',1)));
    perform test.check('commune/wilaya mismatch rejected', false, v_res::text);
  exception when others then
    perform test.check('commune/wilaya mismatch rejected', true, left(sqlerrm, 100));
  end;
end $$;

-- =============================================================================
select test.suite('05-confirmation');

-- -----------------------------------------------------------------------------
-- CONFIRMATION — the only place stock leaves inventory
-- -----------------------------------------------------------------------------
do $$
declare
  v_res jsonb; v_order uuid := current_setting('test.order')::uuid;
  v_admin text := current_setting('test.admin', true);
  v_before int;
begin
  if v_admin is null or v_admin = '' then
    perform test.check('confirmation tests', false, 'SKIPPED — no Super Admin account exists');
    return;
  end if;

  -- Impersonate the admin so app.current_admin_id() resolves.
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin)::text, true);

  select stock_on_hand into v_before
  from public.product_variants where id = test.fx('variant');

  v_res := public.confirm_order(v_order, 'ZZTEST confirmed by phone');
  perform test.check('order confirmed', (v_res->>'ok')::boolean, v_res::text);

  perform test.eq('stock decremented by the ordered quantity (D-040)',
    (select stock_on_hand from public.product_variants where id = test.fx('variant')),
    v_before - 2);

  perform test.check('ledger records the confirmation',
    exists (select 1 from public.stock_movements
            where order_id = v_order and movement_type = 'order_confirmed'));

  perform test.check('timeline records the status change with the actor and note',
    exists (select 1 from public.order_timeline
            where order_id = v_order and event_type = 'status_changed'
              and actor_id = v_admin::uuid and note is not null));

  perform test.check('confirmed_at and confirmed_by are set',
    (select confirmed_at is not null and confirmed_by is not null
     from public.orders where id = v_order));

  perform test.check('order enqueued for Google Sheets (D-151)',
    exists (select 1 from public.sheets_sync_queue where order_id = v_order));

  -- Idempotency: confirming twice must not double-decrement.
  v_res := public.confirm_order(v_order, 'again');
  perform test.eq('second confirmation refused', v_res->>'reason', 'already_confirmed');
  perform test.eq('stock unchanged after the refused second confirmation',
    (select stock_on_hand from public.product_variants where id = test.fx('variant')),
    v_before - 2);
end $$;

-- -----------------------------------------------------------------------------
-- Insufficient stock is a HARD BLOCK, and names the short lines
-- -----------------------------------------------------------------------------
do $$
declare v_res jsonb; v_order uuid; v_admin text := current_setting('test.admin', true);
begin
  if v_admin is null or v_admin = '' then return; end if;

  -- variant2 has 1 unit; order 5.
  delete from public.orders where phone_e164 = '+213565555555';
  v_res := public.place_order('Sur','Stock','0565555555', test.fx('wilaya'), test.fx('commune'),
             test.fx('bureau'), null, null,
             jsonb_build_array(jsonb_build_object('variant_id', test.fx('variant2'),'quantity',5)));
  select id into v_order from public.orders where reference = v_res->>'reference';

  v_res := public.confirm_order(v_order, null);
  perform test.eq('confirmation blocked by insufficient stock', v_res->>'reason', 'insufficient_stock');
  perform test.check('response names the short line',
    jsonb_array_length(v_res->'lines') = 1, (v_res->'lines')::text);
  perform test.eq('stock untouched after a blocked confirmation',
    (select stock_on_hand from public.product_variants where id = test.fx('variant2')), 1);

  -- Oversell requires BOTH the permission and a mandatory note.
  begin
    v_res := public.confirm_order(v_order, null, true);
    perform test.check('oversell without a note rejected', false, v_res::text);
  exception when others then
    perform test.check('oversell without a note rejected', true, left(sqlerrm, 100));
  end;

  v_res := public.confirm_order(v_order, 'ZZTEST oversell approved by owner', true);
  perform test.check('oversell with permission and note succeeds', (v_res->>'ok')::boolean, v_res::text);
  perform test.check('oversell flagged in the response', (v_res->>'oversold')::boolean);
  perform test.check('oversell recorded in the timeline',
    exists (select 1 from public.order_timeline
            where order_id = v_order and event_type = 'oversell_override'));
  perform test.eq('stock goes negative only under an explicit override',
    (select stock_on_hand from public.product_variants where id = test.fx('variant2')), -4);
end $$;

-- =============================================================================
select test.suite('06-transitions');

-- -----------------------------------------------------------------------------
-- Full delivery path, then the return path
-- -----------------------------------------------------------------------------
do $$
declare
  v_order uuid := current_setting('test.order')::uuid;
  v_admin text := current_setting('test.admin', true);
  v_res jsonb; v_stock int;
begin
  if v_admin is null or v_admin = '' then return; end if;

  perform test.eq('illegal transition refused (confirmed -> delivered)',
    (public.transition_order_status(v_order, 'delivered'))->>'reason', 'illegal_transition');

  perform test.check('confirmed -> preparing',
    ((public.transition_order_status(v_order, 'preparing', 'packing'))->>'ok')::boolean);
  perform test.check('preparing -> ready_to_ship',
    ((public.transition_order_status(v_order, 'ready_to_ship'))->>'ok')::boolean);
  perform test.check('ready_to_ship -> shipped',
    ((public.transition_order_status(v_order, 'shipped'))->>'ok')::boolean);

  -- Shipping details are ordinary editable columns (D-036)
  update public.orders
  set delivery_company_id = (select id from public.delivery_companies where code = 'yalidine'),
      tracking_number = 'ZZTEST-TRK-001',
      shipped_at = current_date,
      estimated_delivery_at = current_date + 3
  where id = v_order;
  perform test.check('shipping details stored',
    (select tracking_number = 'ZZTEST-TRK-001' from public.orders where id = v_order));

  perform test.check('shipped -> delivered',
    ((public.transition_order_status(v_order, 'delivered'))->>'ok')::boolean);

  select stock_on_hand into v_stock from public.product_variants where id = test.fx('variant');
  perform test.check('delivered -> cash_collected',
    ((public.transition_order_status(v_order, 'cash_collected'))->>'ok')::boolean);
  perform test.eq('cash collection does not touch stock', 
    (select stock_on_hand from public.product_variants where id = test.fx('variant')), v_stock);

  -- Return restores stock (D-044)
  perform test.check('cash_collected -> returned',
    ((public.transition_order_status(v_order, 'returned', 'customer refused'))->>'ok')::boolean);
  perform test.eq('return restores the stock',
    (select stock_on_hand from public.product_variants where id = test.fx('variant')), v_stock + 2);
  perform test.check('return recorded in the ledger',
    exists (select 1 from public.stock_movements
            where order_id = v_order and movement_type = 'order_returned'));

  perform test.check('full timeline retained',
    (select count(*) from public.order_timeline where order_id = v_order) >= 7);
end $$;

-- Cancelling an UNCONFIRMED order must not restore stock that never left.
do $$
declare v_res jsonb; v_order uuid; v_admin text := current_setting('test.admin', true); v_before int;
begin
  if v_admin is null or v_admin = '' then return; end if;

  delete from public.orders where phone_e164 = '+213566666666';
  v_res := public.place_order('Annul','Test','0566666666', test.fx('wilaya'), test.fx('commune'),
             test.fx('bureau'), null, null,
             jsonb_build_array(jsonb_build_object('variant_id', test.fx('variant'),'quantity',1)));
  select id into v_order from public.orders where reference = v_res->>'reference';

  select stock_on_hand into v_before from public.product_variants where id = test.fx('variant');
  perform test.check('new -> cancelled',
    ((public.transition_order_status(v_order, 'cancelled', 'customer changed mind'))->>'ok')::boolean);
  perform test.eq('cancelling an unconfirmed order does NOT invent stock',
    (select stock_on_hand from public.product_variants where id = test.fx('variant')), v_before);
end $$;

-- Marking an order fake must feed the blocklist automatically (D-062)
do $$
declare v_res jsonb; v_order uuid; v_admin text := current_setting('test.admin', true);
begin
  if v_admin is null or v_admin = '' then return; end if;

  delete from public.orders where phone_e164 = '+213567777777';
  v_res := public.place_order('Faux','Client','0567777777', test.fx('wilaya'), test.fx('commune'),
             test.fx('bureau'), null, null,
             jsonb_build_array(jsonb_build_object('variant_id', test.fx('variant'),'quantity',1)));
  select id into v_order from public.orders where reference = v_res->>'reference';

  perform test.check('new -> fake',
    ((public.transition_order_status(v_order, 'fake', 'repeat fake orders'))->>'ok')::boolean);
  perform test.check('phone added to the blocklist automatically',
    exists (select 1 from public.phone_blocklist where phone_e164 = '+213567777777'));

  -- A blocked number must not be able to order again.
  v_res := public.place_order('Faux','Client','0567777777', test.fx('wilaya'), test.fx('commune'),
             test.fx('bureau'), null, null,
             jsonb_build_array(jsonb_build_object('variant_id', test.fx('variant'),'quantity',1)));
  perform test.eq('blocked phone rejected on the next attempt', v_res->>'reason', 'rejected');
end $$;

-- =============================================================================
select test.suite('07-sheets-queue');

-- -----------------------------------------------------------------------------
-- A failing Sheets sync must never block or reverse a confirmation (D-155).
-- -----------------------------------------------------------------------------
do $$
declare
  v_order uuid := current_setting('test.order')::uuid;
  v_claimed int;
begin
  update public.sheets_sync_queue
  set status = 'failed', attempts = 2, last_error = 'ZZTEST simulated token expiry'
  where order_id = v_order;

  perform test.check('order remains confirmed despite a failed sync',
    (select confirmed_at is not null from public.orders where id = v_order));
  perform test.check('stock movement survives a failed sync',
    exists (select 1 from public.stock_movements
            where order_id = v_order and movement_type = 'order_confirmed'));

  -- A failed row must be retried, not abandoned.
  select count(*) into v_claimed from public.claim_sheets_sync_batch(10);
  perform test.check('failed rows are re-claimed for retry', v_claimed >= 1,
    format('%s row(s) claimed', v_claimed));
  perform test.eq('claiming marks the row processing',
    (select status from public.sheets_sync_queue where order_id = v_order), 'processing');
  perform test.check('attempt counter incremented',
    (select attempts from public.sheets_sync_queue where order_id = v_order) = 3);

  -- Exhausted rows must stop being retried forever.
  update public.sheets_sync_queue
  set status = 'failed', attempts = 5, locked_at = null where order_id = v_order;
  select count(*) into v_claimed from public.claim_sheets_sync_batch(10);
  perform test.check('rows past the retry limit are not re-claimed', v_claimed = 0);

  -- One live queue row per order — never a duplicate spreadsheet line.
  perform test.expect_error('duplicate queue row for the same order rejected',
    format('insert into public.sheets_sync_queue (order_id, payload) values (%L, ''{}''::jsonb)', v_order),
    'duplicate');
end $$;

select * from test.report;
select * from test.summary;

rollback;
