-- =============================================================================
-- 0002_geography_delivery.sql
-- Wilayas, communes, delivery methods, delivery pricing, delivery companies.
-- Model: historical 58-wilaya division (D-030, D-244).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- WILAYAS
-- `code` is the identity that matters. Names drift in spelling between sources
-- and couriers; the numeric code does not (D-279, spec §7.1.1).
-- -----------------------------------------------------------------------------
create table public.wilayas (
  id         uuid primary key default gen_random_uuid(),
  code       smallint not null unique check (code between 1 and 58),
  name_fr    text not null,
  name_ar    text not null,
  -- Couriers price the deep south differently; the flag is cheap and factual.
  is_deep_south boolean not null default false,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index wilayas_code_idx on public.wilayas (code);

comment on column public.wilayas.code is
  'Official 1-58 code. Store the code, never the name (D-279).';

-- -----------------------------------------------------------------------------
-- COMMUNES
-- Uniqueness is scoped to (wilaya, name), NEVER global: homonym communes exist
-- in different wilayas and a global constraint would reject valid rows during
-- seeding, appearing as dataset corruption (D-280, spec §7.1.1).
-- -----------------------------------------------------------------------------
create table public.communes (
  id         uuid primary key default gen_random_uuid(),
  wilaya_id  uuid not null references public.wilayas (id) on delete restrict,
  name_fr    text not null,
  name_ar    text not null,
  post_code  text,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint communes_wilaya_name_fr_key unique (wilaya_id, name_fr),
  constraint communes_wilaya_name_ar_key unique (wilaya_id, name_ar)
);

-- Communes are fetched per selected wilaya and never bundled (D-267, C-06).
create index communes_wilaya_idx    on public.communes (wilaya_id, name_fr);
create index communes_name_fr_trgm  on public.communes using gin (name_fr gin_trgm_ops);
create index communes_name_ar_trgm  on public.communes using gin (name_ar gin_trgm_ops);

-- -----------------------------------------------------------------------------
-- DELIVERY METHODS
-- Stored as data so a third method can be added without a deployment.
-- -----------------------------------------------------------------------------
create table public.delivery_methods (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique check (code ~ '^[a-z_]+$'),
  label_fr   text not null,
  label_ar   text not null,
  sort_order smallint not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- DELIVERY PRICES
--
-- V1 prices per wilaya only (D-032). `commune_id` is nullable from day one so
-- commune-level overrides can be switched on with no schema change (D-034).
-- This one belongs in V1 because retrofitting it would mean altering a table
-- already holding production pricing (§31.2).
--
-- Resolution order once enabled: commune override -> wilaya price.
-- -----------------------------------------------------------------------------
create table public.delivery_prices (
  id                 uuid primary key default gen_random_uuid(),
  wilaya_id          uuid not null references public.wilayas (id) on delete cascade,
  commune_id         uuid references public.communes (id) on delete cascade,
  delivery_method_id uuid not null references public.delivery_methods (id) on delete restrict,
  price              numeric(10,2) not null check (price >= 0),
  is_active          boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  -- NULLS NOT DISTINCT: without it, two rows with commune_id = NULL for the same
  -- wilaya + method would both be accepted, silently creating ambiguous pricing.
  constraint delivery_prices_scope_key
    unique nulls not distinct (wilaya_id, commune_id, delivery_method_id)
);

create index delivery_prices_lookup_idx
  on public.delivery_prices (wilaya_id, delivery_method_id)
  where is_active;

-- A commune override must belong to the wilaya it overrides.
create or replace function app.check_delivery_price_commune()
returns trigger
language plpgsql
as $$
begin
  if new.commune_id is not null then
    if not exists (
      select 1 from public.communes c
      where c.id = new.commune_id and c.wilaya_id = new.wilaya_id
    ) then
      raise exception 'commune % does not belong to wilaya %',
        new.commune_id, new.wilaya_id
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

create trigger delivery_prices_commune_check
  before insert or update on public.delivery_prices
  for each row execute function app.check_delivery_price_commune();

-- -----------------------------------------------------------------------------
-- DELIVERY COMPANIES  (per-order selection, D-036 / D-037)
-- No API integration in V1 (D-038) — these are labels the admin picks from.
-- -----------------------------------------------------------------------------
create table public.delivery_companies (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique check (code ~ '^[a-z0-9_]+$'),
  name       text not null,
  sort_order smallint not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- updated_at triggers
create trigger wilayas_set_updated_at            before update on public.wilayas            for each row execute function app.set_updated_at();
create trigger communes_set_updated_at           before update on public.communes           for each row execute function app.set_updated_at();
create trigger delivery_methods_set_updated_at   before update on public.delivery_methods   for each row execute function app.set_updated_at();
create trigger delivery_prices_set_updated_at    before update on public.delivery_prices    for each row execute function app.set_updated_at();
create trigger delivery_companies_set_updated_at before update on public.delivery_companies for each row execute function app.set_updated_at();

-- Audit: pricing changes money, so it is audited. Reference geography is not
-- audited — it is seeded once and rarely touched.
select app.attach_audit('public.delivery_prices');
