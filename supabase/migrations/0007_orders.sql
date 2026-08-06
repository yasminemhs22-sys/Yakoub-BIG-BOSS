-- =============================================================================
-- 0007_orders.sql
-- Order statuses (data, not enum), orders, snapshotted items, timeline,
-- fraud controls.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- ORDER STATUSES  (D-050, D-051)
-- Stored as data so a new status is a row, and so labels are bilingual.
-- The stock flags let the confirmation RPC stay generic.
-- -----------------------------------------------------------------------------
create table public.order_statuses (
  id               uuid primary key default gen_random_uuid(),
  code             text not null unique check (code ~ '^[a-z_]+$'),
  label_fr         text not null,
  label_ar         text not null,
  color_hex        text check (color_hex ~* '^#[0-9a-f]{6}$'),
  sort_order       smallint not null default 0,
  is_terminal      boolean not null default false,
  decrements_stock boolean not null default false,
  restores_stock   boolean not null default false,
  is_system        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  -- A status cannot both take and return stock.
  constraint order_statuses_stock_exclusive
    check (not (decrements_stock and restores_stock))
);

-- -----------------------------------------------------------------------------
-- ALLOWED TRANSITIONS  (D-264)
-- Data, so the workflow can be adjusted without a deployment.
-- A null from_status_id means "valid as the initial status".
-- -----------------------------------------------------------------------------
create table public.order_status_transitions (
  id             uuid primary key default gen_random_uuid(),
  from_status_id uuid references public.order_statuses (id) on delete cascade,
  to_status_id   uuid not null references public.order_statuses (id) on delete cascade,
  created_at     timestamptz not null default now(),
  constraint order_status_transitions_key
    unique nulls not distinct (from_status_id, to_status_id),
  constraint order_status_transitions_not_self
    check (from_status_id is distinct from to_status_id)
);

-- -----------------------------------------------------------------------------
-- ORDERS
--
-- Guest checkout only (D-024). The customer is identified by phone.
-- All monetary values are snapshotted (D-057) — later catalogue edits must
-- never alter a placed order.
-- -----------------------------------------------------------------------------
create table public.orders (
  id                  uuid primary key default gen_random_uuid(),
  reference           text not null unique,
  status_id           uuid not null references public.order_statuses (id) on delete restrict,

  -- Customer (guest)
  first_name          text not null check (length(trim(first_name)) between 2 and 60),
  last_name           text not null check (length(trim(last_name))  between 2 and 60),
  phone_raw           text not null,
  phone_e164          text not null,
  email               text,

  -- Destination
  wilaya_id           uuid not null references public.wilayas (id)  on delete restrict,
  commune_id          uuid not null references public.communes (id) on delete restrict,
  delivery_method_id  uuid not null references public.delivery_methods (id) on delete restrict,
  address             text,
  notes               text,

  -- Money, all snapshotted at submission and recomputed server-side only
  subtotal            numeric(10,2) not null check (subtotal >= 0),
  delivery_fee        numeric(10,2) not null check (delivery_fee >= 0),
  delivery_fee_override numeric(10,2) check (delivery_fee_override >= 0),
  total               numeric(10,2) not null check (total >= 0),

  -- Shipping block (D-036), all admin-editable
  delivery_company_id uuid references public.delivery_companies (id) on delete set null,
  tracking_number     text,
  shipped_at          date,
  estimated_delivery_at date,

  -- Confirmation workflow
  confirmed_at        timestamptz,
  confirmed_by        uuid references public.admin_users (id) on delete set null,
  unreachable_attempts smallint not null default 0 check (unreachable_attempts >= 0),
  next_retry_at       timestamptz,

  -- Fraud forensics. Kept for anti-abuse only; never exposed publicly.
  submitted_ip        inet,
  submitted_user_agent text,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()

  -- NOTE: the "address required for home delivery" rule (D-240) is a
  -- cross-table condition (it depends on delivery_methods.code) and therefore
  -- cannot be a CHECK constraint. It is enforced by the
  -- orders_validate_destination trigger below.
);

create index orders_status_idx     on public.orders (status_id, created_at desc);
create index orders_phone_idx      on public.orders (phone_e164, created_at desc);
create index orders_created_idx    on public.orders (created_at desc);
create index orders_reference_idx  on public.orders (reference);
create index orders_wilaya_idx     on public.orders (wilaya_id);
create index orders_retry_idx      on public.orders (next_retry_at)
  where next_retry_at is not null;

comment on column public.orders.delivery_fee_override is
  'Manual override for negotiated fees (D-277). When set, it wins over delivery_fee.';

-- The commune must belong to the wilaya, and home delivery needs an address.
-- A cross-column rule like this cannot be a CHECK constraint, so it is a trigger.
create or replace function app.validate_order_destination()
returns trigger
language plpgsql
as $$
declare
  v_method_code text;
begin
  if not exists (
    select 1 from public.communes c
    where c.id = new.commune_id and c.wilaya_id = new.wilaya_id
  ) then
    raise exception 'Commune does not belong to the selected wilaya'
      using errcode = 'check_violation';
  end if;

  select code into v_method_code
  from public.delivery_methods where id = new.delivery_method_id;

  if v_method_code = 'domicile'
     and (new.address is null or length(trim(new.address)) < 5) then
    raise exception 'Address is required for home delivery'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger orders_validate_destination
  before insert or update on public.orders
  for each row execute function app.validate_order_destination();

-- -----------------------------------------------------------------------------
-- ORDER ITEMS
--
-- Every display value is snapshotted. variant_id is ON DELETE SET NULL so a
-- deleted product can never destroy order history (D-057, D-058).
-- -----------------------------------------------------------------------------
create table public.order_items (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references public.orders (id) on delete cascade,
  variant_id      uuid references public.product_variants (id) on delete set null,

  -- Snapshot — never joined for display
  product_name_fr text not null,
  product_name_ar text,
  color_name_fr   text,
  color_name_ar   text,
  size_label_fr   text,
  size_label_ar   text,
  sku             text not null,
  unit_price      numeric(10,2) not null check (unit_price >= 0),
  quantity        integer not null check (quantity > 0),
  line_total      numeric(10,2) not null check (line_total >= 0),

  created_at      timestamptz not null default now()
);

create index order_items_order_idx   on public.order_items (order_id);
create index order_items_variant_idx on public.order_items (variant_id) where variant_id is not null;

-- -----------------------------------------------------------------------------
-- ORDER TIMELINE  (D-054, D-055, D-056)
-- Append-only. Administrator, date, time, optional note on every action.
-- -----------------------------------------------------------------------------
create table public.order_timeline (
  id             bigint generated always as identity primary key,
  order_id       uuid not null references public.orders (id) on delete cascade,
  actor_id       uuid references public.admin_users (id) on delete set null,
  event_type     text not null check (event_type in (
    'order_placed','status_changed','call_attempt','note_added',
    'shipping_updated','fee_overridden','oversell_override'
  )),
  from_status_id uuid references public.order_statuses (id) on delete set null,
  to_status_id   uuid references public.order_statuses (id) on delete set null,
  note           text,
  created_at     timestamptz not null default now()
);

create index order_timeline_order_idx on public.order_timeline (order_id, created_at desc);

-- The timeline is append-only for EDITS, but must still cascade when its order
-- is deleted.
--
-- It originally shared forbid_ledger_mutation() with stock_movements, which
-- blocks DELETE as well. That silently disabled the orders.delete permission:
-- any attempt to delete an order failed on the CASCADE into order_timeline,
-- with an error message that talked about stock movements — a lie to whoever
-- read it. Found during Phase 1 verification.
--
-- The distinction is deliberate and matches the ON DELETE rules in the ERD:
--   order_timeline  is part of the ORDER      -> cascades with it
--   stock_movements is part of INVENTORY history -> outlives it (SET NULL)
create or replace function app.forbid_timeline_update()
returns trigger
language plpgsql
as $$
begin
  -- Same cascade-aware rule as the stock ledger; see 0006_inventory.sql.
  if pg_trigger_depth() > 1 then
    return case tg_op when 'DELETE' then old else new end;
  end if;
  raise exception 'order_timeline is append-only; add a new entry instead'
    using errcode = 'restrict_violation';
end;
$$;

create trigger order_timeline_no_update
  before update or delete on public.order_timeline
  for each row execute function app.forbid_timeline_update();

-- Late FK now that orders exist
alter table public.stock_movements
  add constraint stock_movements_order_id_fkey
  foreign key (order_id) references public.orders (id) on delete set null;

-- -----------------------------------------------------------------------------
-- PHONE BLOCKLIST  (D-062)
-- Fed by orders marked `fake`.
-- -----------------------------------------------------------------------------
create table public.phone_blocklist (
  id         uuid primary key default gen_random_uuid(),
  phone_e164 text not null unique,
  reason     text,
  created_by uuid references public.admin_users (id) on delete set null,
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- SUBMISSION LOG  (rate limiting, §19.3)
--
-- There is no Redis in this stack, so rate limiting is enforced against this
-- table inside the submission RPC. Rows are pruned by a scheduled job.
-- -----------------------------------------------------------------------------
create table public.order_submission_log (
  id         bigint generated always as identity primary key,
  ip         inet,
  phone_e164 text,
  succeeded  boolean not null default false,
  created_at timestamptz not null default now()
);

create index order_submission_log_ip_idx    on public.order_submission_log (ip, created_at desc);
create index order_submission_log_phone_idx on public.order_submission_log (phone_e164, created_at desc);

create trigger order_statuses_set_updated_at before update on public.order_statuses for each row execute function app.set_updated_at();
create trigger orders_set_updated_at         before update on public.orders         for each row execute function app.set_updated_at();

select app.attach_audit('public.orders');
select app.attach_audit('public.phone_blocklist');
