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
