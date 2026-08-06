-- =============================================================================
-- YAKOUB BIG BOSS — combined Phase 1 migration  (rev 4)
-- Verified target: PostgreSQL 17.6
-- =============================================================================


-- >>>>>>>>>>>>>>>>>>>> 0001_foundation.sql <<<<<<<<<<<<<<<<<<<<

-- =============================================================================
-- 0001_foundation.sql
-- Extensions, shared helpers, audit infrastructure.
-- Project: YAKOUB BIG BOSS
-- Baseline: PostgreSQL 15+  (see SPECIFICATION.md §28 C-03 Fallback Strategy)
-- =============================================================================

-- WITH SCHEMA public is deliberate, not decorative.
--
-- Supabase installs some extensions into an `extensions` schema. If unaccent
-- landed there, every call to public.unaccent() in app.slugify() would fail at
-- runtime, and the gin_trgm_ops operator class would not resolve when the
-- trigram indexes are created. Pinning the schema removes the ambiguity.
--
-- `if not exists` means these are no-ops if Supabase has already provided them.
create extension if not exists pgcrypto with schema public;   -- gen_random_uuid()
create extension if not exists unaccent with schema public;   -- slug / SKU transliteration
create extension if not exists pg_trgm  with schema public;   -- fuzzy commune + product search

-- Fail fast and loudly if unaccent is not callable as public.unaccent(text),
-- rather than discovering it when the first product slug is generated.
--
-- NOTE: to_regprocedure with an explicit signature, NOT to_regproc.
-- unaccent has two overloads — unaccent(text) and unaccent(regdictionary, text)
-- — and to_regproc() returns NULL for an ambiguous name, which would make this
-- guard fire even when the function is perfectly available.
do $$
declare
  v_schema text;
begin
  if to_regprocedure('public.unaccent(text)') is null then
    select n.nspname into v_schema
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where p.proname = 'unaccent' and pg_get_function_arguments(p.oid) = 'text'
    limit 1;

    raise exception
      'public.unaccent(text) is not available. Found in schema: %. Resolve before continuing.',
      coalesce(v_schema, 'nowhere — extension not installed');
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Schemas
-- app  : internal helper functions, never exposed through PostgREST
-- -----------------------------------------------------------------------------
create schema if not exists app;
revoke all on schema app from anon, authenticated;

-- =============================================================================
-- updated_at maintenance
-- =============================================================================
create or replace function app.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =============================================================================
-- Identity helpers live in 0003_identity.sql, NOT here.
--
-- They are `language sql`, and PostgreSQL validates SQL function bodies at
-- CREATE time (unlike plpgsql, which is only checked when called). Since they
-- read admin_users, role_permissions and permissions, they cannot be created
-- before those tables exist.
--
-- Moving them is the correct fix. Suppressing the check with
-- `set check_function_bodies = off` would hide a real dependency.
-- =============================================================================

-- =============================================================================
-- Text helpers
-- =============================================================================

-- Slugify: lowercase, transliterate accents, collapse non-alphanumerics.
-- Arabic input yields an empty result, so callers must fall back to the French
-- slug (D-139 / spec §17: Arabic slugs are transliterated, never percent-encoded).
create or replace function app.slugify(p_text text)
returns text
language sql
immutable
as $$
  select trim(both '-' from
    regexp_replace(
      lower(public.unaccent(coalesce(p_text, ''))),
      '[^a-z0-9]+', '-', 'g'
    )
  )
$$;

-- ---------------------------------------------------------------------------
-- Algerian phone normalisation (C-07a / D-268)
--
-- Accepts   0XXXXXXXXX | +213XXXXXXXXX | 00213XXXXXXXXX  with any spacing.
-- Returns   +213XXXXXXXXX  (E.164), or null when the input is not valid.
--
-- CONFIGURABLE (D-292). The accepted mobile prefixes, the country code and the
-- national number length are read from `settings`, so the owner can adapt the
-- rule from the dashboard without a deployment.
--
-- This is a deliberate exception to D-283 ("do not build for hypothetical
-- requirements"): Algerian operators add mobile prefixes periodically, which is
-- a recurring real event rather than a speculative one, and the cost is a
-- single settings row.
--
-- CONSEQUENCE: reading settings makes this function STABLE, not IMMUTABLE. It
-- therefore cannot be used inside an index or a generated column. It is not
-- used in either today.
--
-- Returning null rather than raising lets callers decide: the checkout rejects
-- it, an import can quarantine the row.
-- ---------------------------------------------------------------------------
create or replace function app.normalize_phone_dz(p_phone text)
returns text
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_digits   text;
  v_country  text;
  v_length   int;
  v_prefixes text[];
  v_pattern  text;
begin
  if p_phone is null then
    return null;
  end if;

  -- Defaults match Algerian mobile numbering. Used when a setting is absent, so
  -- a missing or malformed row can never disable validation entirely.
  select coalesce(value #>> '{}', '213') into v_country
    from public.settings where key = 'phone.country_code';
  v_country := coalesce(v_country, '213');

  select coalesce((value #>> '{}')::int, 9) into v_length
    from public.settings where key = 'phone.national_length';
  v_length := coalesce(v_length, 9);

  select array(select jsonb_array_elements_text(value)) into v_prefixes
    from public.settings where key = 'phone.mobile_prefixes';
  if v_prefixes is null or cardinality(v_prefixes) = 0 then
    v_prefixes := array['5','6','7'];
  end if;

  v_digits := regexp_replace(p_phone, '[^0-9+]', '', 'g');
  v_digits := regexp_replace(v_digits, '^\+', '00');   -- +213… -> 00213…

  if v_digits ~ ('^00' || v_country || '[0-9]{' || v_length || '}$') then
    v_digits := substring(v_digits from length(v_country) + 3);
  elsif v_digits ~ ('^0[0-9]{' || v_length || '}$') then
    v_digits := substring(v_digits from 2);
  else
    return null;
  end if;

  -- Mobile only. A landline in a COD order is an undeliverable order: the
  -- courier must be able to reach the customer on the road.
  v_pattern := '^(' || array_to_string(v_prefixes, '|') || ')[0-9]{' || (v_length - 1) || '}$';
  if v_digits !~ v_pattern then
    return null;
  end if;

  return '+' || v_country || v_digits;
end;
$$;

comment on function app.normalize_phone_dz(text) is
  'Canonical E.164 form for matching, blocklist and duplicate detection (D-268). Rules configurable via settings (D-292).';

-- =============================================================================
-- Audit log (D-116)
-- Every administrative write is recorded. Append-only.
-- =============================================================================
create table public.audit_log (
  id           bigint generated always as identity primary key,
  actor_id     uuid,
  action       text not null check (action in ('insert','update','delete')),
  entity_table text not null,
  entity_id    text,
  before       jsonb,
  after        jsonb,
  created_at   timestamptz not null default now()
);

create index audit_log_entity_idx  on public.audit_log (entity_table, entity_id);
create index audit_log_actor_idx   on public.audit_log (actor_id, created_at desc);
create index audit_log_created_idx on public.audit_log (created_at desc);

create or replace function app.audit_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_actor uuid := auth.uid();
  v_id    text;
begin
  if tg_op = 'DELETE' then
    v_id := (to_jsonb(old) ->> 'id');
    insert into public.audit_log (actor_id, action, entity_table, entity_id, before)
    values (v_actor, 'delete', tg_table_name, v_id, to_jsonb(old));
    return old;
  elsif tg_op = 'UPDATE' then
    v_id := (to_jsonb(new) ->> 'id');
    -- Skip no-op updates so the log stays readable
    if to_jsonb(old) is distinct from to_jsonb(new) then
      insert into public.audit_log (actor_id, action, entity_table, entity_id, before, after)
      values (v_actor, 'update', tg_table_name, v_id, to_jsonb(old), to_jsonb(new));
    end if;
    return new;
  else
    v_id := (to_jsonb(new) ->> 'id');
    insert into public.audit_log (actor_id, action, entity_table, entity_id, after)
    values (v_actor, 'insert', tg_table_name, v_id, to_jsonb(new));
    return new;
  end if;
end;
$$;

-- Convenience: attach the audit trigger to a table.
create or replace function app.attach_audit(p_table regclass)
returns void
language plpgsql
as $$
begin
  execute format(
    'create trigger %I after insert or update or delete on %s
       for each row execute function app.audit_trigger()',
    'audit_' || replace(p_table::text, 'public.', ''), p_table
  );
end;
$$;

-- >>>>>>>>>>>>>>>>>>>> 0002_geography_delivery.sql <<<<<<<<<<<<<<<<<<<<

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

-- >>>>>>>>>>>>>>>>>>>> 0003_identity.sql <<<<<<<<<<<<<<<<<<<<

-- =============================================================================
-- 0003_identity.sql
-- Roles, permissions, admin users.
-- Supabase Auth is used for STAFF ONLY. The storefront is anonymous (D-115).
-- =============================================================================

create table public.roles (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique check (code ~ '^[a-z_]+$'),
  name_fr    text not null,
  name_ar    text not null,
  -- System roles cannot be deleted; a store must always retain a Super Admin.
  is_system  boolean not null default false,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.permissions (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique check (code ~ '^[a-z_]+\.[a-z_]+$'),
  -- Grouping is for dashboard presentation only.
  group_code  text not null,
  description text not null,
  created_at  timestamptz not null default now()
);

comment on table public.permissions is
  'Permissions are data. Adding a role is a row, never a deployment (D-114).';

create table public.role_permissions (
  role_id       uuid not null references public.roles (id) on delete cascade,
  permission_id uuid not null references public.permissions (id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (role_id, permission_id)
);

create index role_permissions_permission_idx on public.role_permissions (permission_id);

-- -----------------------------------------------------------------------------
-- ADMIN USERS
-- id is the auth.users id. One row per staff member.
-- -----------------------------------------------------------------------------
create table public.admin_users (
  id         uuid primary key references auth.users (id) on delete cascade,
  role_id    uuid not null references public.roles (id) on delete restrict,
  full_name  text not null,
  email      text not null,
  phone      text,
  is_active  boolean not null default true,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index admin_users_role_idx on public.admin_users (role_id);

-- -----------------------------------------------------------------------------
-- Guard: never leave the system without an active Super Admin.
--
-- Without this, an admin can lock everyone out of the dashboard with a single
-- careless edit and there is no recovery path through the UI.
-- -----------------------------------------------------------------------------
create or replace function app.guard_last_super_admin()
returns trigger
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_super_role uuid;
  v_remaining  int;
begin
  select id into v_super_role from public.roles where code = 'super_admin';
  if v_super_role is null then
    return coalesce(new, old);
  end if;

  -- Only act when this change removes a super admin
  if tg_op = 'DELETE' then
    if old.role_id is distinct from v_super_role or not old.is_active then
      return old;
    end if;
  else
    if not (old.role_id = v_super_role and old.is_active)
       or (new.role_id = v_super_role and new.is_active) then
      return new;
    end if;
  end if;

  select count(*) into v_remaining
  from public.admin_users
  where role_id = v_super_role
    and is_active
    and id <> old.id;

  if v_remaining = 0 then
    raise exception 'Cannot remove the last active Super Admin'
      using errcode = 'restrict_violation';
  end if;

  return coalesce(new, old);
end;
$$;

create trigger admin_users_guard_super_admin
  before update or delete on public.admin_users
  for each row execute function app.guard_last_super_admin();

create trigger roles_set_updated_at       before update on public.roles       for each row execute function app.set_updated_at();
create trigger admin_users_set_updated_at before update on public.admin_users for each row execute function app.set_updated_at();

select app.attach_audit('public.roles');
select app.attach_audit('public.role_permissions');
select app.attach_audit('public.admin_users');

-- =============================================================================
-- Identity helpers
--
-- current_admin_id() returns the admin_users row id for the caller, or null.
-- has_permission()   is the single authority for authorisation (D-114).
--                    No `if role = 'admin'` checks anywhere in the codebase.
-- =============================================================================
create or replace function app.current_admin_id()
returns uuid
language sql
stable
security definer
set search_path = public, app
as $$
  select au.id
  from public.admin_users au
  where au.id = auth.uid()
    and au.is_active
$$;

create or replace function app.has_permission(p_code text)
returns boolean
language sql
stable
security definer
set search_path = public, app
as $$
  select exists (
    select 1
    from public.admin_users au
    join public.role_permissions rp on rp.role_id = au.role_id
    join public.permissions p       on p.id = rp.permission_id
    where au.id = auth.uid()
      and au.is_active
      and p.code = p_code
  )
$$;

comment on function app.has_permission(text) is
  'Single source of authorisation truth. Permissions are data (D-114).';

-- >>>>>>>>>>>>>>>>>>>> 0004_cms.sql <<<<<<<<<<<<<<<<<<<<

-- =============================================================================
-- 0004_cms.sql
-- Media library, settings, pages, typed content blocks, navigation.
-- Everything visible on the site is editable from here (D-130).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- MEDIA LIBRARY
-- Files live in Supabase Storage; this table is the reusable index (§12.4).
-- media_type is present from day one so video needs no migration (D-081).
-- -----------------------------------------------------------------------------
create table public.media (
  id           uuid primary key default gen_random_uuid(),
  storage_path text not null unique,
  media_type   text not null default 'image' check (media_type in ('image','video')),
  mime_type    text not null,
  file_size    integer check (file_size > 0),
  width        integer,
  height       integer,
  alt_fr       text,
  alt_ar       text,
  created_by   uuid references public.admin_users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index media_type_idx    on public.media (media_type, created_at desc);
create index media_created_idx on public.media (created_at desc);

-- -----------------------------------------------------------------------------
-- SETTINGS
-- Business info, opening hours, social links, thresholds. Key/value so a new
-- setting never requires a migration.
--
-- `is_public` decides what the anonymous storefront may read. Anything false
-- (thresholds, integration config) stays invisible to the public API.
-- -----------------------------------------------------------------------------
create table public.settings (
  key         text primary key check (key ~ '^[a-z0-9_.]+$'),
  value       jsonb not null,
  description text,
  is_public   boolean not null default false,
  updated_by  uuid references public.admin_users (id) on delete set null,
  updated_at  timestamptz not null default now()
);

comment on column public.settings.is_public is
  'Only is_public rows are readable by anon. Guards thresholds and integration config.';

-- -----------------------------------------------------------------------------
-- PAGES
-- Bilingual SEO metadata per page per language (D-139).
-- Legal pages are created as system pages with empty content (§13.6).
-- -----------------------------------------------------------------------------
create table public.pages (
  id                    uuid primary key default gen_random_uuid(),
  slug                  text not null unique check (slug ~ '^[a-z0-9-]+$'),
  page_type             text not null default 'standard'
                          check (page_type in ('home','standard','legal','contact')),
  title_fr              text not null,
  title_ar              text,
  meta_title_fr         text,
  meta_title_ar         text,
  meta_description_fr   text,
  meta_description_ar   text,
  og_media_id           uuid references public.media (id) on delete set null,
  -- System pages cannot be deleted (home, legal pages).
  is_system             boolean not null default false,
  is_published          boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index pages_published_idx on public.pages (is_published) where is_published;

-- -----------------------------------------------------------------------------
-- CONTENT BLOCKS
--
-- Typed, validated blocks — never raw HTML. Raw HTML authoring would let an
-- administrator break the layout and would open stored XSS on the brand's own
-- site (D-133).
--
-- `data` is jsonb because each block_type has a different shape. The application
-- validates each shape against a schema before writing; the database enforces
-- the allowed type list and ordering.
-- -----------------------------------------------------------------------------
create table public.content_blocks (
  id         uuid primary key default gen_random_uuid(),
  page_id    uuid not null references public.pages (id) on delete cascade,
  block_type text not null check (block_type in (
    'announcement','hero','category_strip','product_carousel',
    'promo_banner','trust_strip','store_presence','social_proof','rich_text'
  )),
  position   integer not null check (position >= 0),
  is_visible boolean not null default true,
  data       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Deferrable so reordering can be done in one transaction without shuffling.
alter table public.content_blocks
  add constraint content_blocks_page_position_key
  unique (page_id, position) deferrable initially deferred;

create index content_blocks_page_idx on public.content_blocks (page_id, position);

-- -----------------------------------------------------------------------------
-- NAVIGATION
-- Menus are data so the admin can restructure navigation without a deployment.
-- -----------------------------------------------------------------------------
create table public.menus (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique check (code ~ '^[a-z_]+$'),
  name       text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.menu_items (
  id          uuid primary key default gen_random_uuid(),
  menu_id     uuid not null references public.menus (id) on delete cascade,
  parent_id   uuid references public.menu_items (id) on delete cascade,
  label_fr    text not null,
  label_ar    text,
  link_type   text not null check (link_type in ('page','category','url')),
  page_id     uuid references public.pages (id) on delete cascade,
  category_id uuid,  -- FK added in 0005 once categories exist
  url         text,
  position    integer not null default 0,
  is_visible  boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- Exactly one target must match the declared link_type.
  constraint menu_items_target_check check (
    (link_type = 'page'     and page_id is not null and category_id is null and url is null) or
    (link_type = 'category' and category_id is not null and page_id is null and url is null) or
    (link_type = 'url'      and url is not null and page_id is null and category_id is null)
  )
);

create index menu_items_menu_idx   on public.menu_items (menu_id, position);
create index menu_items_parent_idx on public.menu_items (parent_id);

create trigger media_set_updated_at          before update on public.media          for each row execute function app.set_updated_at();
create trigger settings_set_updated_at       before update on public.settings       for each row execute function app.set_updated_at();
create trigger pages_set_updated_at          before update on public.pages          for each row execute function app.set_updated_at();
create trigger content_blocks_set_updated_at before update on public.content_blocks for each row execute function app.set_updated_at();
create trigger menus_set_updated_at          before update on public.menus          for each row execute function app.set_updated_at();
create trigger menu_items_set_updated_at     before update on public.menu_items     for each row execute function app.set_updated_at();

select app.attach_audit('public.settings');
select app.attach_audit('public.pages');
select app.attach_audit('public.content_blocks');
select app.attach_audit('public.menu_items');

-- >>>>>>>>>>>>>>>>>>>> 0005_catalogue.sql <<<<<<<<<<<<<<<<<<<<

-- =============================================================================
-- 0005_catalogue.sql
-- Categories, sizes, colours, products, media links, variants.
-- Nothing here is hardcoded: the admin creates categories, sizes and colours.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- CATEGORIES  (admin-managed tree, D-070)
-- -----------------------------------------------------------------------------
create table public.categories (
  id                  uuid primary key default gen_random_uuid(),
  parent_id           uuid references public.categories (id) on delete restrict,
  slug                text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name_fr             text not null,
  name_ar             text,
  description_fr      text,
  description_ar      text,
  media_id            uuid references public.media (id) on delete set null,
  meta_title_fr       text,
  meta_title_ar       text,
  meta_description_fr text,
  meta_description_ar text,
  sort_order          integer not null default 0,
  is_visible          boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint categories_not_self_parent check (id <> parent_id)
);

create index categories_parent_idx  on public.categories (parent_id, sort_order);
create index categories_visible_idx on public.categories (is_visible) where is_visible;

-- Prevent cycles. A category tree with a loop makes every recursive query hang.
create or replace function app.check_category_cycle()
returns trigger
language plpgsql
as $$
declare
  v_parent uuid := new.parent_id;
  v_depth  int := 0;
begin
  while v_parent is not null loop
    if v_parent = new.id then
      raise exception 'Category cycle detected' using errcode = 'check_violation';
    end if;
    v_depth := v_depth + 1;
    if v_depth > 10 then
      raise exception 'Category nesting too deep' using errcode = 'check_violation';
    end if;
    select parent_id into v_parent from public.categories where id = v_parent;
  end loop;
  return new;
end;
$$;

create trigger categories_cycle_check
  before insert or update of parent_id on public.categories
  for each row execute function app.check_category_cycle();

-- Deferred FK from menu_items (declared in 0004 before categories existed)
alter table public.menu_items
  add constraint menu_items_category_id_fkey
  foreign key (category_id) references public.categories (id) on delete cascade;

-- -----------------------------------------------------------------------------
-- SIZES  (admin-created, D-071)
-- size_group + sort_order so the admin never hand-orders XXL before S (D-074).
-- -----------------------------------------------------------------------------
create table public.sizes (
  id         uuid primary key default gen_random_uuid(),
  label_fr   text not null,
  label_ar   text,
  size_group text not null default 'alpha'
               check (size_group in ('alpha','numeric','one_size','custom')),
  sort_order integer not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sizes_group_label_key unique (size_group, label_fr)
);

create index sizes_ordering_idx on public.sizes (size_group, sort_order);

-- -----------------------------------------------------------------------------
-- COLOURS  (admin-created, D-072 / D-073)
-- -----------------------------------------------------------------------------
create table public.colors (
  id         uuid primary key default gen_random_uuid(),
  name_fr    text not null unique,
  name_ar    text,
  hex_value  text not null check (hex_value ~* '^#[0-9a-f]{6}$'),
  sort_order integer not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- PRODUCTS
-- Original price required, sale price optional (D-241, D-242, D-243).
-- -----------------------------------------------------------------------------
create table public.products (
  id                  uuid primary key default gen_random_uuid(),
  -- Categories are a many-to-many relation; see product_categories below.
  slug                text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name_fr             text not null,
  name_ar             text,
  description_fr      text,
  description_ar      text,
  care_info_fr        text,
  care_info_ar        text,
  size_guide_fr       text,
  size_guide_ar       text,
  original_price      numeric(10,2) not null check (original_price >= 0),
  sale_price          numeric(10,2) check (sale_price >= 0),
  meta_title_fr       text,
  meta_title_ar       text,
  meta_description_fr text,
  meta_description_ar text,
  is_published        boolean not null default false,
  published_at        timestamptz,
  sort_order          integer not null default 0,
  created_by          uuid references public.admin_users (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  -- A sale price that is not lower than the original is a data-entry error, not
  -- a promotion. Rejecting it here prevents a struck-through price that reads
  -- as a price increase.
  constraint products_sale_price_lower
    check (sale_price is null or sale_price < original_price)
);

create index products_published_idx on public.products (is_published, published_at desc)
  where is_published;
create index products_name_fr_trgm  on public.products using gin (name_fr gin_trgm_ops);
create index products_name_ar_trgm  on public.products using gin (name_ar gin_trgm_ops);

-- -----------------------------------------------------------------------------
-- PRODUCT ↔ CATEGORY  (many-to-many)
--
-- A product can sit in several categories at once ("T-shirts" and "Été"),
-- which a single category_id could not express.
--
-- `is_primary` exists because some things need exactly ONE category:
-- breadcrumbs, the canonical URL, and the category shown on a product card.
-- Without it, those would pick an arbitrary row and change order between
-- queries.
-- -----------------------------------------------------------------------------
create table public.product_categories (
  product_id  uuid not null references public.products (id)   on delete cascade,
  category_id uuid not null references public.categories (id) on delete restrict,
  is_primary  boolean not null default false,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  primary key (product_id, category_id)
);

-- At most one primary category per product, enforced by the database.
create unique index product_categories_one_primary
  on public.product_categories (product_id)
  where is_primary;

-- Listing products in a category is the single most common storefront query.
create index product_categories_category_idx
  on public.product_categories (category_id, sort_order);

-- First category assigned becomes primary automatically, mirroring the
-- featured-image rule so the two behave predictably alike.
create or replace function app.auto_primary_category()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1 from public.product_categories
    where product_id = new.product_id
      and category_id <> new.category_id
  ) then
    new.is_primary := true;
  end if;
  return new;
end;
$$;

create trigger product_categories_auto_primary
  before insert on public.product_categories
  for each row execute function app.auto_primary_category();

-- Removing the primary category promotes the next by sort_order, so a product
-- never silently loses its breadcrumb.
create or replace function app.promote_primary_category()
returns trigger
language plpgsql
as $$
begin
  if old.is_primary then
    update public.product_categories
    set is_primary = true
    where product_id = old.product_id
      and category_id = (
        select category_id from public.product_categories
        where product_id = old.product_id and category_id <> old.category_id
        order by sort_order, created_at
        limit 1
      );
  end if;
  return old;
end;
$$;

create trigger product_categories_promote_primary
  after delete on public.product_categories
  for each row execute function app.promote_primary_category();

-- The active price feeds cart, totals and snapshots (D-243).
create or replace function public.product_active_price(p_product public.products)
returns numeric
language sql
immutable
as $$
  select coalesce(p_product.sale_price, p_product.original_price)
$$;

-- -----------------------------------------------------------------------------
-- PRODUCT MEDIA
-- Unlimited images, drag-and-drop ordering, exactly one featured (D-078..D-080).
-- -----------------------------------------------------------------------------
create table public.product_media (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products (id) on delete cascade,
  media_id    uuid not null references public.media (id) on delete restrict,
  sort_order  integer not null default 0,
  is_featured boolean not null default false,
  created_at  timestamptz not null default now(),
  constraint product_media_unique unique (product_id, media_id)
);

create index product_media_product_idx on public.product_media (product_id, sort_order);

-- Exactly one featured image per product, enforced by the database (D-272).
create unique index product_media_one_featured
  on public.product_media (product_id)
  where is_featured;

-- Deleting the featured image promotes the next by sort_order. Without this the
-- product silently loses its thumbnail everywhere it is listed.
create or replace function app.promote_featured_media()
returns trigger
language plpgsql
as $$
begin
  if old.is_featured then
    update public.product_media
    set is_featured = true
    where id = (
      select id from public.product_media
      where product_id = old.product_id and id <> old.id
      order by sort_order, created_at
      limit 1
    );
  end if;
  return old;
end;
$$;

create trigger product_media_promote_featured
  after delete on public.product_media
  for each row execute function app.promote_featured_media();

-- First image added to a product becomes featured automatically.
create or replace function app.auto_feature_first_media()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1 from public.product_media
    where product_id = new.product_id and id <> new.id
  ) then
    new.is_featured := true;
  end if;
  return new;
end;
$$;

create trigger product_media_auto_feature
  before insert on public.product_media
  for each row execute function app.auto_feature_first_media();

-- A product with no images cannot be published (D-272).
create or replace function app.check_product_publishable()
returns trigger
language plpgsql
as $$
begin
  if new.is_published and not coalesce(old.is_published, false) then
    if not exists (select 1 from public.product_media where product_id = new.id) then
      raise exception 'Cannot publish a product with no images'
        using errcode = 'check_violation';
    end if;
    if not exists (select 1 from public.product_variants where product_id = new.id) then
      raise exception 'Cannot publish a product with no variants'
        using errcode = 'check_violation';
    end if;
    new.published_at := coalesce(new.published_at, now());
  end if;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- PRODUCT VARIANTS
--
-- The sellable unit. colour and size are BOTH nullable: a One Size product in
-- three colours is three ordinary rows with size_id null — no special cases
-- (D-075).
--
-- stock_on_hand is a cache maintained by the movement ledger in 0006. The
-- ledger is the source of truth (D-043).
-- -----------------------------------------------------------------------------
create table public.product_variants (
  id               uuid primary key default gen_random_uuid(),
  product_id       uuid not null references public.products (id) on delete cascade,
  color_id         uuid references public.colors (id) on delete restrict,
  size_id          uuid references public.sizes (id) on delete restrict,
  sku              text not null unique,
  sku_is_custom    boolean not null default false,
  price_adjustment numeric(10,2) not null default 0,
  product_media_id uuid references public.product_media (id) on delete set null,
  barcode          text,          -- reserved (D-076); unused in V1
  stock_on_hand    integer not null default 0,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- C-03 / D-260 — variant uniqueness with nullable colour and size.
--
-- PostgreSQL treats NULLs as distinct in unique constraints by default, so a
-- plain UNIQUE(product_id, color_id, size_id) would silently allow duplicate
-- one-size variants. NULLS NOT DISTINCT gives the semantics we actually want.
--
-- FALLBACK (D-290) — if the live project runs PostgreSQL 14 or earlier, replace
-- ONLY the constraint below with the expression index in
-- 0005b_variant_uniqueness_pg14_fallback.sql. Nothing else changes.
-- ---------------------------------------------------------------------------
alter table public.product_variants
  add constraint product_variants_combo_key
  unique nulls not distinct (product_id, color_id, size_id);

create index product_variants_product_idx on public.product_variants (product_id)
  where is_active;
create index product_variants_stock_idx   on public.product_variants (stock_on_hand)
  where is_active;

-- The variant image must belong to the same product.
create or replace function app.check_variant_media()
returns trigger
language plpgsql
as $$
begin
  if new.product_media_id is not null then
    if not exists (
      select 1 from public.product_media pm
      where pm.id = new.product_media_id and pm.product_id = new.product_id
    ) then
      raise exception 'Variant image must belong to the same product'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

create trigger product_variants_media_check
  before insert or update on public.product_variants
  for each row execute function app.check_variant_media();

create trigger products_publishable_check
  before update on public.products
  for each row execute function app.check_product_publishable();

create trigger categories_set_updated_at       before update on public.categories       for each row execute function app.set_updated_at();
create trigger sizes_set_updated_at            before update on public.sizes            for each row execute function app.set_updated_at();
create trigger colors_set_updated_at           before update on public.colors           for each row execute function app.set_updated_at();
create trigger products_set_updated_at         before update on public.products         for each row execute function app.set_updated_at();
create trigger product_variants_set_updated_at before update on public.product_variants for each row execute function app.set_updated_at();

select app.attach_audit('public.categories');
select app.attach_audit('public.products');
select app.attach_audit('public.product_variants');

-- >>>>>>>>>>>>>>>>>>>> 0006_inventory.sql <<<<<<<<<<<<<<<<<<<<

-- =============================================================================
-- 0006_inventory.sql
-- Stock as an append-only ledger (D-043). The ledger is the source of truth;
-- product_variants.stock_on_hand is a maintained cache.
--
-- Why a ledger and not a counter: returns, cancellations and manual corrections
-- all happen in this business, and "why is this size gone?" must be answerable.
-- =============================================================================

create table public.stock_movements (
  id            bigint generated always as identity primary key,
  variant_id    uuid not null references public.product_variants (id) on delete cascade,
  movement_type text not null check (movement_type in (
    'order_confirmed',    -- decrease
    'order_returned',     -- increase
    'order_cancelled',    -- increase (only after a confirmation)
    'restock',            -- increase
    'manual_correction',  -- either
    'initial'             -- opening balance
  )),
  quantity_delta integer not null check (quantity_delta <> 0),
  order_id       uuid,   -- FK added in 0007 once orders exist
  actor_id       uuid references public.admin_users (id) on delete set null,
  note           text,
  created_at     timestamptz not null default now()
);

create index stock_movements_variant_idx on public.stock_movements (variant_id, created_at desc);
create index stock_movements_order_idx   on public.stock_movements (order_id) where order_id is not null;
create index stock_movements_type_idx    on public.stock_movements (movement_type, created_at desc);

comment on table public.stock_movements is
  'Append-only stock ledger. Never UPDATE or DELETE — post a compensating row.';

-- -----------------------------------------------------------------------------
-- Movement types are a CHECK constraint, not a table, unlike order statuses.
--
-- Justification (D-283): order statuses need bilingual labels shown to admins
-- and drive a configurable workflow, so they are data. Movement types are
-- internal accounting categories with no UI labels and no configurability. A
-- lookup table would add a join to every stock query for no benefit.
-- -----------------------------------------------------------------------------

-- Keep the cached quantity in step with the ledger.
create or replace function app.apply_stock_movement()
returns trigger
language plpgsql
as $$
begin
  update public.product_variants
  set stock_on_hand = stock_on_hand + new.quantity_delta
  where id = new.variant_id;
  return new;
end;
$$;

create trigger stock_movements_apply
  after insert on public.stock_movements
  for each row execute function app.apply_stock_movement();

-- The ledger is append-only. Corrections are new rows, never edits.
create or replace function app.forbid_ledger_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'stock_movements is append-only; post a compensating movement instead'
    using errcode = 'restrict_violation';
end;
$$;

create trigger stock_movements_no_update
  before update or delete on public.stock_movements
  for each row execute function app.forbid_ledger_mutation();

-- -----------------------------------------------------------------------------
-- Reconciliation: the cache must always equal the sum of the ledger.
-- Exposed so the dashboard can prove integrity rather than assume it.
-- -----------------------------------------------------------------------------
create or replace function public.stock_reconciliation()
returns table (
  variant_id     uuid,
  sku            text,
  cached_stock   integer,
  ledger_stock   bigint,
  is_consistent  boolean
)
language sql
stable
as $$
  select
    v.id,
    v.sku,
    v.stock_on_hand,
    coalesce(sum(m.quantity_delta), 0) as ledger_stock,
    v.stock_on_hand = coalesce(sum(m.quantity_delta), 0)
  from public.product_variants v
  left join public.stock_movements m on m.variant_id = v.id
  group by v.id, v.sku, v.stock_on_hand
$$;

-- >>>>>>>>>>>>>>>>>>>> 0007_orders.sql <<<<<<<<<<<<<<<<<<<<

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

create trigger order_timeline_no_update
  before update or delete on public.order_timeline
  for each row execute function app.forbid_ledger_mutation();

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

-- >>>>>>>>>>>>>>>>>>>> 0008_integrations.sql <<<<<<<<<<<<<<<<<<<<

-- =============================================================================
-- 0008_integrations.sql
-- Google Sheets sync queue (D-155) and debounced Netlify rebuilds (D-252).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- GOOGLE SHEETS SYNC QUEUE
--
-- Confirmation enqueues; a Netlify Function drains. If Sheets is unreachable or
-- the token has expired, nothing is lost and the admin's confirmation is never
-- blocked (D-155). One sheet, all orders (D-152).
-- -----------------------------------------------------------------------------
create table public.sheets_sync_queue (
  id           bigint generated always as identity primary key,
  order_id     uuid not null references public.orders (id) on delete cascade,
  status       text not null default 'pending'
                 check (status in ('pending','processing','done','failed')),
  attempts     smallint not null default 0 check (attempts >= 0),
  last_error   text,
  payload      jsonb not null,
  locked_at    timestamptz,
  processed_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- One live queue entry per order. A re-sync resets the existing row rather than
-- creating a duplicate line in the spreadsheet.
create unique index sheets_sync_queue_order_key on public.sheets_sync_queue (order_id);

create index sheets_sync_queue_pending_idx
  on public.sheets_sync_queue (status, created_at)
  where status in ('pending','failed');

comment on table public.sheets_sync_queue is
  'One-way mirror: database -> Sheets. Edits made in Sheets never flow back (D-154).';

-- Claim a batch atomically. FOR UPDATE SKIP LOCKED lets several function
-- invocations run concurrently without processing the same row twice.
create or replace function public.claim_sheets_sync_batch(p_limit int default 20)
returns setof public.sheets_sync_queue
language plpgsql
security definer
set search_path = public, app
as $$
begin
  return query
  with claimed as (
    select id from public.sheets_sync_queue
    where status in ('pending','failed')
      and attempts < 5
      and (locked_at is null or locked_at < now() - interval '5 minutes')
    order by created_at
    limit p_limit
    for update skip locked
  )
  update public.sheets_sync_queue q
  set status = 'processing',
      locked_at = now(),
      attempts = q.attempts + 1
  from claimed
  where q.id = claimed.id
  returning q.*;
end;
$$;

revoke all on function public.claim_sheets_sync_batch(int) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- BUILD REQUESTS  (C-02 / D-251, D-252, D-253)
--
-- CMS publishing inserts a request; a debounced worker triggers one Netlify
-- build for a burst of edits instead of one build per keystroke.
-- -----------------------------------------------------------------------------
create table public.build_requests (
  id           bigint generated always as identity primary key,
  reason       text not null,
  requested_by uuid references public.admin_users (id) on delete set null,
  status       text not null default 'pending'
                 check (status in ('pending','triggered','failed','superseded')),
  triggered_at timestamptz,
  error        text,
  created_at   timestamptz not null default now()
);

create index build_requests_pending_idx on public.build_requests (status, created_at)
  where status = 'pending';

create trigger sheets_sync_queue_set_updated_at
  before update on public.sheets_sync_queue
  for each row execute function app.set_updated_at();

-- >>>>>>>>>>>>>>>>>>>> 0009_functions.sql <<<<<<<<<<<<<<<<<<<<

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

-- >>>>>>>>>>>>>>>>>>>> 0010_place_order.sql <<<<<<<<<<<<<<<<<<<<

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

-- >>>>>>>>>>>>>>>>>>>> 0011_rls.sql <<<<<<<<<<<<<<<<<<<<

-- =============================================================================
-- 0011_rls.sql
--
-- RLS is the primary security model (D-233).
--
-- Governing rules:
--   * Orders and customer PII: NO public read. Ever. (D-234)
--   * Published catalogue and content: public read.
--   * Everything else: authenticated + permission-checked.
--
-- RLS is enabled on EVERY table. A table without RLS in Supabase is a table
-- readable by anyone holding the anon key.
-- =============================================================================

do $$
declare t text;
begin
  foreach t in array array[
    'wilayas','communes','delivery_methods','delivery_prices','delivery_companies',
    'roles','permissions','role_permissions','admin_users','audit_log',
    'media','settings','pages','content_blocks','menus','menu_items',
    'categories','sizes','colors','products','product_categories','product_media','product_variants',
    'stock_movements','order_statuses','order_status_transitions','orders',
    'order_items','order_timeline','phone_blocklist','order_submission_log',
    'sheets_sync_queue','build_requests'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    -- NOTE: FORCE ROW LEVEL SECURITY is deliberately NOT used.
    -- app.current_admin_id() is SECURITY DEFINER and reads admin_users, whose
    -- own policy calls it. Without an owner bypass this recurses infinitely.
    -- The application never connects as the table owner, so FORCE would add
    -- recursion risk with no security benefit.
  end loop;
end $$;

-- =============================================================================
-- PUBLIC READ — reference data needed to render the storefront and checkout
-- =============================================================================
create policy wilayas_public_read on public.wilayas
  for select to anon, authenticated using (is_active);

create policy communes_public_read on public.communes
  for select to anon, authenticated using (is_active);

create policy delivery_methods_public_read on public.delivery_methods
  for select to anon, authenticated using (is_active);

-- Prices are public by necessity: the delivery estimator on the product page
-- and the live total in checkout both need them before an order exists.
create policy delivery_prices_public_read on public.delivery_prices
  for select to anon, authenticated using (is_active);

create policy sizes_public_read  on public.sizes  for select to anon, authenticated using (is_active);
create policy colors_public_read on public.colors for select to anon, authenticated using (is_active);

create policy categories_public_read on public.categories
  for select to anon, authenticated using (is_visible);

create policy products_public_read on public.products
  for select to anon, authenticated using (is_published);

-- Media and variants are readable only through a published product.
create policy product_categories_public_read on public.product_categories
  for select to anon, authenticated
  using (exists (
    select 1 from public.products p
    where p.id = product_categories.product_id and p.is_published
  ));

create policy product_media_public_read on public.product_media
  for select to anon, authenticated
  using (exists (
    select 1 from public.products p
    where p.id = product_media.product_id and p.is_published
  ));

create policy product_variants_public_read on public.product_variants
  for select to anon, authenticated
  using (is_active and exists (
    select 1 from public.products p
    where p.id = product_variants.product_id and p.is_published
  ));

create policy media_public_read on public.media
  for select to anon, authenticated using (true);

create policy pages_public_read on public.pages
  for select to anon, authenticated using (is_published);

create policy content_blocks_public_read on public.content_blocks
  for select to anon, authenticated
  using (is_visible and exists (
    select 1 from public.pages p
    where p.id = content_blocks.page_id and p.is_published
  ));

create policy menus_public_read on public.menus
  for select to anon, authenticated using (true);

create policy menu_items_public_read on public.menu_items
  for select to anon, authenticated using (is_visible);

-- Only settings explicitly marked public. Thresholds and integration config
-- must never be reachable with the anon key.
create policy settings_public_read on public.settings
  for select to anon, authenticated using (is_public);

-- Status labels are needed to render the tracking page.
create policy order_statuses_public_read on public.order_statuses
  for select to anon, authenticated using (true);

-- =============================================================================
-- NO PUBLIC ACCESS AT ALL
--
-- orders, order_items, order_timeline, phone_blocklist, order_submission_log,
-- audit_log, admin_users, stock_movements, sheets_sync_queue.
--
-- These have no anon policy of any kind. Customers reach their own order only
-- through track_order(), which is SECURITY DEFINER and requires reference+phone.
-- =============================================================================

-- =============================================================================
-- ADMIN ACCESS — permission-driven (D-114)
-- =============================================================================

-- Read policies are split by sensitivity.
--
-- Tables holding no customer data: readable by any active admin.
-- Tables holding customer PII or audit history: gated on a specific permission,
-- so a Content Manager cannot read orders (least privilege).

do $$
declare t text;
begin
  foreach t in array array[
    'wilayas','communes','delivery_methods','delivery_companies','delivery_prices',
    'sizes','colors','categories','products','product_categories','product_media','product_variants',
    'media','settings','pages','content_blocks','menus','menu_items',
    'order_statuses','order_status_transitions','build_requests'
  ]
  loop
    execute format(
      'create policy %I on public.%I for select to authenticated
         using (app.current_admin_id() is not null)', t || '_admin_read', t);
  end loop;
end $$;

-- Customer data and operational history — permission-gated.
do $$
declare r record;
begin
  for r in
    select * from (values
      ('orders',              'orders.view'),
      ('order_items',         'orders.view'),
      ('order_timeline',      'orders.view'),
      ('phone_blocklist',     'orders.view'),
      ('sheets_sync_queue',   'orders.view'),
      ('stock_movements',     'inventory.manage'),
      ('audit_log',           'audit.view'),
      ('roles',               'roles.manage'),
      ('permissions',         'roles.manage'),
      ('role_permissions',    'roles.manage'),
      ('admin_users',         'admins.manage')
    ) as t(tbl, perm)
  loop
    execute format(
      'create policy %I on public.%I for select to authenticated
         using (app.has_permission(%L))', r.tbl || '_admin_read', r.tbl, r.perm);
  end loop;
end $$;

-- Every admin must be able to read their OWN row, otherwise the dashboard
-- cannot render the signed-in user without admins.manage.
create policy admin_users_read_self on public.admin_users
  for select to authenticated using (id = auth.uid());

-- Write policies, grouped by the permission that governs them
do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('categories',        'catalogue.manage'),
      ('products',          'catalogue.manage'),
      ('product_categories','catalogue.manage'),
      ('product_media',     'catalogue.manage'),
      ('product_variants',  'catalogue.manage'),
      ('sizes',             'catalogue.manage'),
      ('colors',            'catalogue.manage'),
      ('media',             'content.manage'),
      ('pages',             'content.manage'),
      ('content_blocks',    'content.manage'),
      ('menus',             'content.manage'),
      ('menu_items',        'content.manage'),
      ('settings',          'settings.manage'),
      ('delivery_prices',   'delivery.manage'),
      ('delivery_companies','delivery.manage'),
      ('delivery_methods',  'delivery.manage'),
      ('roles',             'roles.manage'),
      ('role_permissions',  'roles.manage'),
      ('admin_users',       'admins.manage'),
      ('order_statuses',    'settings.manage'),
      ('order_status_transitions','settings.manage'),
      ('phone_blocklist',   'orders.update'),
      ('build_requests',    'content.manage')
    ) as t(tbl, perm)
  loop
    execute format(
      'create policy %I on public.%I for insert to authenticated
         with check (app.has_permission(%L))', r.tbl || '_admin_insert', r.tbl, r.perm);
    execute format(
      'create policy %I on public.%I for update to authenticated
         using (app.has_permission(%L)) with check (app.has_permission(%L))',
      r.tbl || '_admin_update', r.tbl, r.perm, r.perm);
    execute format(
      'create policy %I on public.%I for delete to authenticated
         using (app.has_permission(%L))', r.tbl || '_admin_delete', r.tbl, r.perm);
  end loop;
end $$;

-- Orders: admins may edit shipping details and notes directly. Status changes
-- and stock movements go exclusively through the RPCs in 0009, which enforce
-- locking, legal transitions and the ledger.
create policy orders_admin_update on public.orders
  for update to authenticated
  using (app.has_permission('orders.update'))
  with check (app.has_permission('orders.update'));

create policy orders_admin_delete on public.orders
  for delete to authenticated
  using (app.has_permission('orders.delete'));

-- Timeline notes may be added by hand; the append-only trigger blocks edits.
create policy order_timeline_admin_insert on public.order_timeline
  for insert to authenticated
  with check (app.has_permission('orders.update'));

-- Manual stock corrections and restocks.
create policy stock_movements_admin_insert on public.stock_movements
  for insert to authenticated
  with check (app.has_permission('inventory.manage'));

-- audit_log is append-only and written by SECURITY DEFINER triggers only.
-- No insert, update or delete policy exists for anyone.

-- =============================================================================
-- GRANTS
-- RLS filters rows; grants decide whether the table is addressable at all.
-- Both are required.
-- =============================================================================
grant usage on schema public to anon, authenticated;
grant select on all tables in schema public to anon, authenticated;
grant insert, update, delete on all tables in schema public to authenticated;

-- Tables anon must never even attempt to read.
revoke all on public.orders, public.order_items, public.order_timeline,
              public.phone_blocklist, public.order_submission_log,
              public.audit_log, public.admin_users, public.stock_movements,
              public.sheets_sync_queue, public.build_requests,
              public.permissions, public.role_permissions, public.roles
  from anon;

-- Append-only and system-managed tables: no direct DML for anyone.
-- Writes happen through SECURITY DEFINER functions only.
revoke insert, update, delete on public.audit_log from authenticated;
revoke update, delete on public.stock_movements  from authenticated;
revoke update, delete on public.order_timeline   from authenticated;
revoke insert, update, delete on public.order_submission_log from authenticated;

-- app schema is internal
revoke all on all functions in schema app from anon, authenticated;

-- >>>>>>>>>>>>>>>>>>>> 0001_system_data.sql <<<<<<<<<<<<<<<<<<<<

-- =============================================================================
-- 0001_system_data.sql
-- System reference data. Safe to re-run (idempotent).
-- Contains NO geography — wilayas and communes are seeded separately and are
-- currently PENDING verification of the official codes.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- ORDER STATUSES  (D-051)
-- -----------------------------------------------------------------------------
insert into public.order_statuses
  (code, label_fr, label_ar, sort_order, is_terminal, decrements_stock, restores_stock, color_hex)
values
  ('new',                  'Nouvelle',              'جديد',            10, false, false, false, '#3B82F6'),
  ('pending_confirmation', 'En cours de contact',   'قيد التأكيد',     20, false, false, false, '#F59E0B'),
  ('unreachable',          'Injoignable',           'لا يرد',          30, false, false, false, '#F97316'),
  ('confirmed',            'Confirmée',             'مؤكد',            40, false, true,  false, '#22C55E'),
  ('preparing',            'En préparation',        'قيد التحضير',     50, false, false, false, '#8B5CF6'),
  ('ready_to_ship',        'Prête à expédier',      'جاهز للشحن',      60, false, false, false, '#6366F1'),
  ('shipped',              'Expédiée',              'تم الشحن',        70, false, false, false, '#0EA5E9'),
  ('delivered',            'Livrée',                'تم التسليم',      80, false, false, false, '#10B981'),
  ('cash_collected',       'Montant encaissé',      'تم استلام المبلغ',90, true,  false, false, '#059669'),
  ('returned',             'Retournée',             'مرتجع',          100, true,  false, true,  '#EF4444'),
  ('cancelled',            'Annulée',               'ملغى',           110, true,  false, true,  '#6B7280'),
  ('fake',                 'Commande frauduleuse',  'طلب وهمي',       120, true,  false, true,  '#991B1B')
on conflict (code) do update
  set label_fr = excluded.label_fr,
      label_ar = excluded.label_ar,
      sort_order = excluded.sort_order,
      is_terminal = excluded.is_terminal,
      decrements_stock = excluded.decrements_stock,
      restores_stock = excluded.restores_stock,
      color_hex = excluded.color_hex;

-- -----------------------------------------------------------------------------
-- ALLOWED TRANSITIONS
-- Terminal statuses have no outgoing transitions except back to cancelled where
-- a real workflow needs it. Every path a phone-based COD operation actually uses.
-- -----------------------------------------------------------------------------
with s as (select code, id from public.order_statuses)
insert into public.order_status_transitions (from_status_id, to_status_id)
select f.id, t.id
from (values
  ('new','pending_confirmation'), ('new','confirmed'), ('new','cancelled'), ('new','fake'),
  ('pending_confirmation','confirmed'), ('pending_confirmation','unreachable'),
  ('pending_confirmation','cancelled'), ('pending_confirmation','fake'),
  ('unreachable','pending_confirmation'), ('unreachable','confirmed'),
  ('unreachable','cancelled'), ('unreachable','fake'),
  ('confirmed','preparing'), ('confirmed','cancelled'),
  ('preparing','ready_to_ship'), ('preparing','cancelled'),
  ('ready_to_ship','shipped'), ('ready_to_ship','cancelled'),
  ('shipped','delivered'), ('shipped','returned'),
  ('delivered','cash_collected'), ('delivered','returned'),
  ('cash_collected','returned')
) as v(from_code, to_code)
join s f on f.code = v.from_code
join s t on t.code = v.to_code
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- DELIVERY METHODS  (D-031)
-- -----------------------------------------------------------------------------
insert into public.delivery_methods (code, label_fr, label_ar, sort_order)
values
  ('bureau',   'Bureau',      'مكتب',        10),
  ('domicile', 'À domicile',  'إلى المنزل',  20)
on conflict (code) do update
  set label_fr = excluded.label_fr, label_ar = excluded.label_ar;

-- -----------------------------------------------------------------------------
-- DELIVERY COMPANIES  (D-037) — labels only, no API integration in V1
-- -----------------------------------------------------------------------------
insert into public.delivery_companies (code, name, sort_order)
values
  ('yalidine',   'Yalidine',   10),
  ('zr_express', 'ZR Express', 20),
  ('noest',      'Noest',      30),
  ('custom',     'Autre',      99)
on conflict (code) do nothing;

-- -----------------------------------------------------------------------------
-- PERMISSIONS
-- -----------------------------------------------------------------------------
insert into public.permissions (code, group_code, description) values
  ('orders.view',       'orders',    'View orders'),
  ('orders.confirm',    'orders',    'Confirm orders (decrements stock)'),
  ('orders.update',     'orders',    'Change order status and shipping details'),
  ('orders.delete',     'orders',    'Delete orders'),
  ('orders.oversell',   'orders',    'Confirm an order despite insufficient stock'),
  ('orders.export',     'orders',    'Export orders'),
  ('catalogue.manage',  'catalogue', 'Manage products, variants, categories, sizes, colours'),
  ('inventory.manage',  'inventory', 'Manual stock corrections and restocks'),
  ('content.manage',    'content',   'Manage pages, blocks, media and navigation'),
  ('delivery.manage',   'delivery',  'Manage delivery prices, methods and companies'),
  ('settings.manage',   'settings',  'Manage business settings and workflow configuration'),
  ('roles.manage',      'access',    'Manage roles and permissions'),
  ('admins.manage',     'access',    'Manage administrator accounts'),
  ('audit.view',        'access',    'View the audit log')
on conflict (code) do update set description = excluded.description;

-- -----------------------------------------------------------------------------
-- ROLES  (D-112)
-- -----------------------------------------------------------------------------
insert into public.roles (code, name_fr, name_ar, is_system, sort_order) values
  ('super_admin',     'Super Administrateur', 'مدير عام',        true, 10),
  ('administrator',   'Administrateur',       'مسؤول',           true, 20),
  ('content_manager', 'Gestionnaire contenu', 'مسؤول المحتوى',   true, 30)
on conflict (code) do update
  set name_fr = excluded.name_fr, name_ar = excluded.name_ar;

-- Super Admin: everything.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.code = 'super_admin'
on conflict do nothing;

-- Administrator: runs the shop, but cannot manage access or oversell.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.code in (
  'orders.view','orders.confirm','orders.update','orders.export',
  'catalogue.manage','inventory.manage','content.manage','delivery.manage'
)
where r.code = 'administrator'
on conflict do nothing;

-- Content Manager: content and media only. No access to customer data.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.code in (
  'content.manage'
)
where r.code = 'content_manager'
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- SETTINGS
-- Values are intentionally empty where the Product Owner supplies them later
-- (email, opening hours). No placeholder text ever reaches production (D-138).
-- -----------------------------------------------------------------------------
insert into public.settings (key, value, description, is_public) values
  ('business.name',        '"YAKOUB BIG BOSS"'::jsonb,        'Official brand name (D-190)', true),
  ('business.phone',       '"0563876210"'::jsonb,             'Primary phone', true),
  ('business.whatsapp',    '"0563876210"'::jsonb,             'WhatsApp number', true),
  ('business.email',       'null'::jsonb,                     'Business email — to be supplied', true),
  ('business.address_fr',  '"Hlaimia, Boudouaou, Boumerdès"'::jsonb, 'Address (FR)', true),
  ('business.address_ar',  '"حلايمية أمام مسجد حسان بن ثابت"'::jsonb, 'Address (AR, D-191)', true),
  ('business.opening_hours', '[]'::jsonb,                     'Opening hours — to be supplied', true),
  ('business.map_url',     'null'::jsonb,                     'Map link — to be supplied', true),
  ('social.instagram',     '"yakoub_big_boos"'::jsonb,        'Instagram handle (D-194)', true),
  ('social.tiktok',        '"yakoub_big_boos"'::jsonb,        'TikTok handle (D-194)', true),
  ('social.facebook',      'null'::jsonb,                     'Facebook page URL', true),
  ('i18n.default_locale',  '"fr"'::jsonb,                     'Fallback locale (D-093)', true),
  ('inventory.low_stock_threshold',    '5'::jsonb,  'Low-stock alert threshold (O-013)', false),
  ('inventory.display_threshold',      '10'::jsonb, 'Above this, show "in stock" not a number (D-047)', true),
  ('orders.unreachable_retry_days',    '1'::jsonb,  'Days before retrying an unreachable order', false),
  ('build.debounce_minutes',           '10'::jsonb, 'Minimum minutes between rebuilds (D-252)', false),
  -- Phone validation rules (D-292). Editable from the dashboard so a newly
  -- issued mobile prefix does not require a deployment.
  ('phone.country_code',     '"213"'::jsonb,        'International dialling code', false),
  ('phone.national_length',  '9'::jsonb,            'Digits after the leading 0', false),
  ('phone.mobile_prefixes',  '["5","6","7"]'::jsonb,'Accepted mobile prefixes (05/06/07)', false)
on conflict (key) do nothing;

-- -----------------------------------------------------------------------------
-- SYSTEM PAGES
-- Created empty. Content is supplied through the CMS before launch (§13.6).
-- -----------------------------------------------------------------------------
insert into public.pages (slug, page_type, title_fr, title_ar, is_system, is_published) values
  ('home',              'home',    'Accueil',                  'الرئيسية',            true, true),
  ('privacy-policy',    'legal',   'Politique de confidentialité', 'سياسة الخصوصية',  true, false),
  ('return-policy',     'legal',   'Politique de retour',      'سياسة الإرجاع',       true, false),
  ('terms-conditions',  'legal',   'Conditions générales',     'الشروط والأحكام',     true, false),
  ('contact',           'contact', 'Contact',                  'اتصل بنا',            true, false)
on conflict (slug) do nothing;

insert into public.menus (code, name) values
  ('main',   'Main navigation'),
  ('footer', 'Footer navigation')
on conflict (code) do nothing;
