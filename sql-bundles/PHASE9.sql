-- =============================================================================
-- 0014_sheets_sync.sql — Phase 9
--
-- The queue already exists from Phase 1. What was missing: a way for the
-- worker to report back, and a single source for the row it writes.
--
-- Nothing here touches orders. Sheets is a one-way mirror (D-154): a failure
-- marks a queue row, and never a customer's order.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- The exact row written to the spreadsheet.
--
-- Built in SQL rather than assembled in the worker so the column order is
-- defined in one place. If the worker built it, adding a column would mean
-- editing JavaScript and hoping the header row still matched.
--
-- Values are read from the ORDER SNAPSHOT, not from the live catalogue: a
-- spreadsheet row must keep saying what was actually sold (D-057).
-- ---------------------------------------------------------------------------
create or replace function public.sheets_order_payload(p_order_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, app
as $$
  select jsonb_build_object(
    'reference',        o.reference,
    'created_at',       to_char(o.created_at at time zone 'Africa/Algiers', 'YYYY-MM-DD HH24:MI'),
    'confirmed_at',     to_char(o.confirmed_at at time zone 'Africa/Algiers', 'YYYY-MM-DD HH24:MI'),
    'first_name',       o.first_name,
    'last_name',        o.last_name,
    'phone',            o.phone_raw,
    'wilaya_code',      w.code,
    'wilaya',           w.name_fr,
    'commune',          c.name_fr,
    'delivery_method',  dm.label_fr,
    'address',          coalesce(o.address, ''),
    'items',            (
                          select string_agg(
                            format('%s%s x%s',
                              oi.product_name_fr,
                              case
                                when oi.color_name_fr is null and oi.size_label_fr is null then ''
                                else ' (' || concat_ws(' / ', oi.color_name_fr, oi.size_label_fr) || ')'
                              end,
                              oi.quantity),
                            ' | ' order by oi.created_at)
                          from public.order_items oi
                          where oi.order_id = o.id
                        ),
    'skus',             (
                          select string_agg(oi.sku, ' | ' order by oi.created_at)
                          from public.order_items oi where oi.order_id = o.id
                        ),
    'subtotal',         o.subtotal,
    'delivery_fee',     coalesce(o.delivery_fee_override, o.delivery_fee),
    'total',            o.subtotal + coalesce(o.delivery_fee_override, o.delivery_fee),
    'status',           st.label_fr,
    'delivery_company', coalesce(dc.name, ''),
    'tracking_number',  coalesce(o.tracking_number, ''),
    'notes',            coalesce(o.notes, '')
  )
  from public.orders o
  join public.order_statuses st on st.id = o.status_id
  join public.wilayas w         on w.id  = o.wilaya_id
  join public.communes c        on c.id  = o.commune_id
  join public.delivery_methods dm on dm.id = o.delivery_method_id
  left join public.delivery_companies dc on dc.id = o.delivery_company_id
  where o.id = p_order_id
$$;

revoke all on function public.sheets_order_payload(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Worker callbacks
-- ---------------------------------------------------------------------------
create or replace function public.mark_sheets_synced(p_ids bigint[])
returns void
language sql
volatile
security definer
set search_path = public, app
as $$
  update public.sheets_sync_queue
  set status = 'done', processed_at = now(), last_error = null, locked_at = null
  where id = any(p_ids)
$$;

create or replace function public.mark_sheets_failed(p_id bigint, p_error text)
returns void
language sql
volatile
security definer
set search_path = public, app
as $$
  update public.sheets_sync_queue
  set status = 'failed', last_error = left(p_error, 500), locked_at = null
  where id = p_id
$$;

revoke all on function public.mark_sheets_synced(bigint[]) from public, anon, authenticated;
revoke all on function public.mark_sheets_failed(bigint, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Manual re-sync from the dashboard (D-156).
--
-- Resets attempts so a row that exhausted its retries can be pushed again once
-- the underlying problem — an expired token, a renamed sheet — is fixed.
-- ---------------------------------------------------------------------------
create or replace function public.requeue_sheets_sync(p_order_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public, app
as $$
begin
  if not app.has_permission('orders.export') then
    raise exception 'Not authorised' using errcode = 'insufficient_privilege';
  end if;

  insert into public.sheets_sync_queue (order_id, payload)
  values (p_order_id, jsonb_build_object('order_id', p_order_id, 'requeued_at', now()))
  on conflict (order_id) do update
    set status = 'pending', attempts = 0, last_error = null,
        locked_at = null, processed_at = null;
end;
$$;

revoke all on function public.requeue_sheets_sync(uuid) from public, anon;
grant execute on function public.requeue_sheets_sync(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Queue health, for the dashboard panel.
-- ---------------------------------------------------------------------------
create or replace function public.sheets_sync_health()
returns jsonb
language sql
stable
security definer
set search_path = public, app
as $$
  select jsonb_build_object(
    'pending',    count(*) filter (where status = 'pending'),
    'processing', count(*) filter (where status = 'processing'),
    'done',       count(*) filter (where status = 'done'),
    'failed',     count(*) filter (where status = 'failed'),
    'exhausted',  count(*) filter (where status = 'failed' and attempts >= 5),
    'last_error', (select last_error from public.sheets_sync_queue
                   where last_error is not null
                   order by updated_at desc limit 1),
    'last_synced_at', (select max(processed_at) from public.sheets_sync_queue
                       where status = 'done')
  )
  from public.sheets_sync_queue
$$;

revoke all on function public.sheets_sync_health() from public, anon;
grant execute on function public.sheets_sync_health() to authenticated;

select 'phase 9 sheets functions ready' as status;
