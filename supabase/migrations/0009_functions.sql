-- =============================================================================
-- 0009_functions.sql
-- Business logic that must be atomic or must not be trusted to the client.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- SKU generation  (C-07c / D-271)
-- Auto-generated, manually overridable. sku_is_custom protects manual choices
-- from being overwritten when a product is renamed.
-- -----------------------------------------------------------------------------
create or replace function app.generate_sku(
  p_product_id uuid,
  p_color_id   uuid,
  p_size_id    uuid
)
returns text
language plpgsql
stable
as $$
declare
  v_base  text;
  v_color text := '';
  v_size  text := '';
begin
  select upper(left(regexp_replace(app.slugify(p.name_fr), '-', '', 'g'), 12))
    into v_base
  from public.products p where p.id = p_product_id;

  if p_color_id is not null then
    select '-' || upper(left(regexp_replace(app.slugify(c.name_fr), '-', '', 'g'), 6))
      into v_color from public.colors c where c.id = p_color_id;
  end if;

  if p_size_id is not null then
    select '-' || upper(regexp_replace(app.slugify(s.label_fr), '-', '', 'g'))
      into v_size from public.sizes s where s.id = p_size_id;
  end if;

  return coalesce(v_base, 'PROD') || coalesce(v_color, '') || coalesce(v_size, '');
end;
$$;

create or replace function app.assign_variant_sku()
returns trigger
language plpgsql
as $$
declare
  v_sku      text;
  v_candidate text;
  v_suffix   int := 0;
begin
  if new.sku_is_custom and new.sku is not null and new.sku <> '' then
    return new;                      -- manual choice, left alone (D-271)
  end if;

  v_sku := app.generate_sku(new.product_id, new.color_id, new.size_id);
  v_candidate := v_sku;

  -- Distinct products can share a name; disambiguate rather than fail.
  while exists (
    select 1 from public.product_variants
    where sku = v_candidate and id is distinct from new.id
  ) loop
    v_suffix := v_suffix + 1;
    v_candidate := v_sku || '-' || v_suffix;
  end loop;

  new.sku := v_candidate;
  return new;
end;
$$;

create trigger product_variants_assign_sku
  before insert or update of product_id, color_id, size_id, sku_is_custom
  on public.product_variants
  for each row execute function app.assign_variant_sku();

-- -----------------------------------------------------------------------------
-- Order reference  (C-07b / D-269)
-- YBB-YYMMDD-XXXX, Crockford base32 minus ambiguous characters.
-- Non-sequential: sequential references leak order volume and invite
-- enumeration on the public tracking page (D-270).
-- -----------------------------------------------------------------------------
create or replace function app.generate_order_reference()
returns text
language plpgsql
volatile
as $$
declare
  v_alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';  -- no I L O U
  v_ref      text;
  v_rand     text;
  i          int;
begin
  for attempt in 1..10 loop
    v_rand := '';
    for i in 1..4 loop
      v_rand := v_rand || substr(v_alphabet, 1 + floor(random() * 32)::int, 1);
    end loop;
    v_ref := 'YBB-' || to_char(now(), 'YYMMDD') || '-' || v_rand;
    exit when not exists (select 1 from public.orders where reference = v_ref);
    v_ref := null;
  end loop;

  if v_ref is null then
    raise exception 'Could not allocate a unique order reference';
  end if;
  return v_ref;
end;
$$;

-- -----------------------------------------------------------------------------
-- Delivery fee resolution
-- Commune override first, wilaya price second (D-034). In V1 no commune
-- overrides exist, so this always resolves to the wilaya price.
-- -----------------------------------------------------------------------------
create or replace function public.resolve_delivery_fee(
  p_wilaya_id  uuid,
  p_commune_id uuid,
  p_method_id  uuid
)
returns numeric
language sql
stable
as $$
  select price
  from public.delivery_prices
  where delivery_method_id = p_method_id
    and is_active
    and wilaya_id = p_wilaya_id
    and (commune_id = p_commune_id or commune_id is null)
  order by commune_id nulls last    -- a commune override outranks the wilaya price
  limit 1
$$;

-- -----------------------------------------------------------------------------
-- CONFIRM ORDER  (C-04 / D-261 … D-264)
--
-- The single most important function in the system. It must be atomic:
--   - row locks prevent two admins confirming the last unit
--   - insufficient stock is a hard block by default
--   - status, stock ledger, timeline and Sheets queue move together or not at all
--
-- Returns a JSON result rather than raising for the "out of stock" case, so the
-- dashboard can show WHICH lines are short instead of a generic error.
-- -----------------------------------------------------------------------------
create or replace function public.confirm_order(
  p_order_id       uuid,
  p_note           text default null,
  p_allow_oversell boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_admin        uuid := app.current_admin_id();
  v_order        public.orders%rowtype;
  v_confirmed    uuid;
  v_current_code text;
  v_short        jsonb := '[]'::jsonb;
  v_item         record;
begin
  if v_admin is null or not app.has_permission('orders.confirm') then
    raise exception 'Not authorised to confirm orders' using errcode = 'insufficient_privilege';
  end if;

  -- Lock the order first, then the variants, always in this order.
  -- A consistent lock ordering is what prevents deadlocks between two admins.
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found' using errcode = 'no_data_found';
  end if;

  select code into v_current_code from public.order_statuses where id = v_order.status_id;
  if v_current_code = 'confirmed' then
    return jsonb_build_object('ok', false, 'reason', 'already_confirmed');
  end if;

  select id into v_confirmed from public.order_statuses where code = 'confirmed';

  if not exists (
    select 1 from public.order_status_transitions
    where from_status_id = v_order.status_id and to_status_id = v_confirmed
  ) then
    return jsonb_build_object(
      'ok', false, 'reason', 'illegal_transition', 'from', v_current_code
    );
  end if;

  -- Lock every variant in the order in a deterministic order, then check stock.
  for v_item in
    select oi.id, oi.variant_id, oi.quantity, oi.sku, oi.product_name_fr, v.stock_on_hand
    from public.order_items oi
    join public.product_variants v on v.id = oi.variant_id
    where oi.order_id = p_order_id
    order by oi.variant_id
    for update of v
  loop
    if v_item.stock_on_hand < v_item.quantity then
      v_short := v_short || jsonb_build_object(
        'sku', v_item.sku,
        'product', v_item.product_name_fr,
        'requested', v_item.quantity,
        'available', v_item.stock_on_hand
      );
    end if;
  end loop;

  -- Items whose variant was deleted cannot be confirmed automatically.
  if exists (
    select 1 from public.order_items
    where order_id = p_order_id and variant_id is null
  ) then
    return jsonb_build_object('ok', false, 'reason', 'variant_missing');
  end if;

  if jsonb_array_length(v_short) > 0 and not p_allow_oversell then
    return jsonb_build_object('ok', false, 'reason', 'insufficient_stock', 'lines', v_short);
  end if;

  if jsonb_array_length(v_short) > 0 then
    if not app.has_permission('orders.oversell') then
      raise exception 'Not authorised to oversell' using errcode = 'insufficient_privilege';
    end if;
    if p_note is null or length(trim(p_note)) = 0 then
      raise exception 'A note is required when overselling' using errcode = 'check_violation';
    end if;
    insert into public.order_timeline (order_id, actor_id, event_type, note)
    values (p_order_id, v_admin, 'oversell_override', p_note);
  end if;

  -- Ledger: stock leaves inventory here and nowhere else (D-040).
  insert into public.stock_movements (variant_id, movement_type, quantity_delta, order_id, actor_id, note)
  select oi.variant_id, 'order_confirmed', -oi.quantity, p_order_id, v_admin, p_note
  from public.order_items oi
  where oi.order_id = p_order_id and oi.variant_id is not null;

  update public.orders
  set status_id = v_confirmed, confirmed_at = now(), confirmed_by = v_admin
  where id = p_order_id;

  insert into public.order_timeline (order_id, actor_id, event_type, from_status_id, to_status_id, note)
  values (p_order_id, v_admin, 'status_changed', v_order.status_id, v_confirmed, p_note);

  -- Sheets mirror. Enqueue only; never let the integration block confirmation.
  insert into public.sheets_sync_queue (order_id, payload)
  values (p_order_id, jsonb_build_object('order_id', p_order_id, 'confirmed_at', now()))
  on conflict (order_id) do update
    set status = 'pending', attempts = 0, last_error = null, locked_at = null;

  return jsonb_build_object('ok', true, 'oversold', jsonb_array_length(v_short) > 0);
end;
$$;

revoke all on function public.confirm_order(uuid, text, boolean) from public, anon;
grant execute on function public.confirm_order(uuid, text, boolean) to authenticated;

-- -----------------------------------------------------------------------------
-- TRANSITION ORDER STATUS
-- Every other status change. Restores stock when the target status says so.
-- -----------------------------------------------------------------------------
create or replace function public.transition_order_status(
  p_order_id  uuid,
  p_to_status text,
  p_note      text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_admin  uuid := app.current_admin_id();
  v_order  public.orders%rowtype;
  v_to     public.order_statuses%rowtype;
  v_from   public.order_statuses%rowtype;
begin
  if v_admin is null or not app.has_permission('orders.update') then
    raise exception 'Not authorised' using errcode = 'insufficient_privilege';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found' using errcode = 'no_data_found';
  end if;

  select * into v_to   from public.order_statuses where code = p_to_status;
  select * into v_from from public.order_statuses where id = v_order.status_id;
  if v_to.id is null then
    raise exception 'Unknown status %', p_to_status using errcode = 'no_data_found';
  end if;

  if p_to_status = 'confirmed' then
    return jsonb_build_object('ok', false, 'reason', 'use_confirm_order');
  end if;

  if not exists (
    select 1 from public.order_status_transitions
    where from_status_id = v_order.status_id and to_status_id = v_to.id
  ) then
    return jsonb_build_object(
      'ok', false, 'reason', 'illegal_transition',
      'from', v_from.code, 'to', p_to_status
    );
  end if;

  -- Stock returns only if it actually left. An order cancelled before
  -- confirmation never decremented anything, so there is nothing to restore.
  if v_to.restores_stock and v_order.confirmed_at is not null then
    insert into public.stock_movements (variant_id, movement_type, quantity_delta, order_id, actor_id, note)
    select oi.variant_id,
           case when v_to.code = 'returned' then 'order_returned' else 'order_cancelled' end,
           oi.quantity, p_order_id, v_admin, p_note
    from public.order_items oi
    where oi.order_id = p_order_id and oi.variant_id is not null;
  end if;

  if v_to.code = 'unreachable' then
    update public.orders
    set status_id = v_to.id,
        unreachable_attempts = unreachable_attempts + 1,
        next_retry_at = now() + interval '1 day'
    where id = p_order_id;
  else
    update public.orders set status_id = v_to.id where id = p_order_id;
  end if;

  insert into public.order_timeline (order_id, actor_id, event_type, from_status_id, to_status_id, note)
  values (p_order_id, v_admin, 'status_changed', v_order.status_id, v_to.id, p_note);

  -- A fake order feeds the blocklist automatically (D-062).
  if v_to.code = 'fake' then
    insert into public.phone_blocklist (phone_e164, reason, created_by)
    values (v_order.phone_e164, coalesce(p_note, 'Order marked fake'), v_admin)
    on conflict (phone_e164) do nothing;
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.transition_order_status(uuid, text, text) from public, anon;
grant execute on function public.transition_order_status(uuid, text, text) to authenticated;
