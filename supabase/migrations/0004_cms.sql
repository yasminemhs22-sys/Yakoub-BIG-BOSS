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
