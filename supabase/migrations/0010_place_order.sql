-- =============================================================================
-- 0010_place_order.sql
--
-- The only write path available to anonymous visitors.
--
-- The cart sends variant ids and quantities. It NEVER sends prices (D-273).
-- Every monetary value is computed here from the database, so a tampered
-- request cannot change what an order costs (D-274). This is the single most
-- important integrity rule in the checkout.
--
-- Placing an order does NOT touch stock (D-041).
-- =============================================================================

create or replace function public.place_order(
  p_first_name  text,
  p_last_name   text,
  p_phone       text,
  p_wilaya_id   uuid,
  p_commune_id  uuid,
  p_method_id   uuid,
  p_address     text default null,
  p_notes       text default null,
  p_items       jsonb default '[]'::jsonb,   -- [{variant_id, quantity}, …]
  p_honeypot    text default null,
  p_ip          inet default null,
  p_user_agent  text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_phone     text;
  v_status    uuid;
  v_order_id  uuid;
  v_reference text;
  v_subtotal  numeric(10,2) := 0;
  v_fee       numeric(10,2);
  v_item      jsonb;
  v_variant   record;
  v_qty       int;
  v_unit      numeric(10,2);
  v_count     int;
  v_recent    int;
begin
  -- 1. Honeypot. A filled hidden field means a bot. Return success so the bot
  --    learns nothing, but persist nothing.
  if p_honeypot is not null and length(trim(p_honeypot)) > 0 then
    return jsonb_build_object('ok', true, 'reference', 'YBB-000000-0000');
  end if;

  -- 2. Phone must normalise to a valid Algerian number (D-268).
  v_phone := app.normalize_phone_dz(p_phone);
  if v_phone is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid_phone');
  end if;

  -- 3. Blocklist
  if exists (select 1 from public.phone_blocklist where phone_e164 = v_phone) then
    insert into public.order_submission_log (ip, phone_e164, succeeded)
    values (p_ip, v_phone, false);
    -- Deliberately vague: telling a blocked number it is blocked invites evasion.
    return jsonb_build_object('ok', false, 'reason', 'rejected');
  end if;

  -- 4. Rate limiting (§19.3). Per phone and per IP.
  select count(*) into v_recent
  from public.order_submission_log
  where phone_e164 = v_phone and created_at > now() - interval '1 hour';
  if v_recent >= 3 then
    return jsonb_build_object('ok', false, 'reason', 'rate_limited');
  end if;

  if p_ip is not null then
    select count(*) into v_recent
    from public.order_submission_log
    where ip = p_ip and created_at > now() - interval '1 hour';
    if v_recent >= 10 then
      return jsonb_build_object('ok', false, 'reason', 'rate_limited');
    end if;
  end if;

  -- 5. Duplicate detection: same phone, same minute, likely a double submit.
  if exists (
    select 1 from public.orders
    where phone_e164 = v_phone and created_at > now() - interval '2 minutes'
  ) then
    return jsonb_build_object('ok', false, 'reason', 'duplicate_submission');
  end if;

  -- 6. Cart must be non-empty and within a sane size.
  v_count := jsonb_array_length(coalesce(p_items, '[]'::jsonb));
  if v_count = 0 or v_count > 50 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_cart');
  end if;

  -- 7. Delivery fee, resolved server-side.
  v_fee := public.resolve_delivery_fee(p_wilaya_id, p_commune_id, p_method_id);
  if v_fee is null then
    return jsonb_build_object('ok', false, 'reason', 'no_delivery_price');
  end if;

  select id into v_status from public.order_statuses where code = 'new';
  v_reference := app.generate_order_reference();

  insert into public.orders (
    reference, status_id, first_name, last_name, phone_raw, phone_e164,
    wilaya_id, commune_id, delivery_method_id, address, notes,
    subtotal, delivery_fee, total, submitted_ip, submitted_user_agent
  ) values (
    v_reference, v_status, trim(p_first_name), trim(p_last_name), p_phone, v_phone,
    p_wilaya_id, p_commune_id, p_method_id, nullif(trim(coalesce(p_address,'')), ''), p_notes,
    0, v_fee, v_fee, p_ip, left(coalesce(p_user_agent, ''), 500)
  )
  returning id into v_order_id;

  -- 8. Snapshot each line from the database (D-057).
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty := greatest(1, least(coalesce((v_item->>'quantity')::int, 1), 20));

    select pv.id, pv.sku, pv.price_adjustment,
           p.name_fr, p.name_ar, p.original_price, p.sale_price,
           c.name_fr as color_fr, c.name_ar as color_ar,
           s.label_fr as size_fr, s.label_ar as size_ar
      into v_variant
    from public.product_variants pv
    join public.products p on p.id = pv.product_id
    left join public.colors c on c.id = pv.color_id
    left join public.sizes  s on s.id = pv.size_id
    where pv.id = (v_item->>'variant_id')::uuid
      and pv.is_active
      and p.is_published;

    if not found then
      raise exception 'Variant unavailable' using errcode = 'no_data_found';
    end if;

    v_unit := coalesce(v_variant.sale_price, v_variant.original_price)
              + coalesce(v_variant.price_adjustment, 0);

    insert into public.order_items (
      order_id, variant_id, product_name_fr, product_name_ar,
      color_name_fr, color_name_ar, size_label_fr, size_label_ar,
      sku, unit_price, quantity, line_total
    ) values (
      v_order_id, v_variant.id, v_variant.name_fr, v_variant.name_ar,
      v_variant.color_fr, v_variant.color_ar, v_variant.size_fr, v_variant.size_ar,
      v_variant.sku, v_unit, v_qty, v_unit * v_qty
    );

    v_subtotal := v_subtotal + (v_unit * v_qty);
  end loop;

  update public.orders
  set subtotal = v_subtotal, total = v_subtotal + v_fee
  where id = v_order_id;

  insert into public.order_timeline (order_id, event_type, to_status_id, note)
  values (v_order_id, 'order_placed', v_status, null);

  insert into public.order_submission_log (ip, phone_e164, succeeded)
  values (p_ip, v_phone, true);

  return jsonb_build_object('ok', true, 'reference', v_reference, 'total', v_subtotal + v_fee);
end;
$$;

revoke all on function public.place_order(text,text,text,uuid,uuid,uuid,text,text,jsonb,text,inet,text) from public;
grant execute on function public.place_order(text,text,text,uuid,uuid,uuid,text,text,jsonb,text,inet,text) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- PUBLIC ORDER TRACKING  (D-059)
-- Requires reference AND phone. Returns only what the customer already knows,
-- plus status. Never exposes the orders table itself.
-- -----------------------------------------------------------------------------
create or replace function public.track_order(p_reference text, p_phone text)
returns jsonb
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_phone text := app.normalize_phone_dz(p_phone);
  v_row   record;
begin
  if v_phone is null then
    return jsonb_build_object('ok', false);
  end if;

  select o.reference, o.created_at, o.total,
         st.code as status_code, st.label_fr, st.label_ar,
         o.tracking_number, o.estimated_delivery_at
    into v_row
  from public.orders o
  join public.order_statuses st on st.id = o.status_id
  where upper(o.reference) = upper(trim(p_reference))
    and o.phone_e164 = v_phone;

  if not found then
    return jsonb_build_object('ok', false);
  end if;

  return jsonb_build_object('ok', true, 'order', to_jsonb(v_row));
end;
$$;

revoke all on function public.track_order(text, text) from public;
grant execute on function public.track_order(text, text) to anon, authenticated;
