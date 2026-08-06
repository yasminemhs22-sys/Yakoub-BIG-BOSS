-- =============================================================================
-- 0015_seo.sql — Phase 10
--
-- SEO data comes from the CMS, never from code (D-139). These functions are the
-- single source the sitemap and the crawler meta-injector both read, so a title
-- the owner edits in the dashboard appears identically in Google, in a WhatsApp
-- preview, and on the page itself.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Everything crawlable, in one query.
--
-- `has_ar` decides whether the Arabic URL enters the sitemap at all (D-265).
-- The storefront still falls back to French silently for customers, but telling
-- Google a page is Arabic when it is not earns a duplicate-content penalty and
-- teaches it to distrust the hreflang pair.
-- ---------------------------------------------------------------------------
create or replace function public.sitemap_entries()
returns table (
  path        text,
  updated_at  timestamptz,
  priority    numeric,
  changefreq  text,
  has_ar      boolean
)
language sql
stable
security definer
set search_path = public, app
as $$
  -- Home
  select '/'::text,
         greatest(p.updated_at, coalesce(max(cb.updated_at), p.updated_at)),
         1.0::numeric,
         'daily'::text,
         coalesce(nullif(trim(p.title_ar), ''), '') <> ''
  from public.pages p
  left join public.content_blocks cb on cb.page_id = p.id
  where p.slug = 'home' and p.is_published
  group by p.id, p.updated_at, p.title_ar

  union all

  -- Standalone CMS pages
  select '/p/' || p.slug,
         p.updated_at,
         0.3::numeric,
         'monthly'::text,
         coalesce(nullif(trim(p.title_ar), ''), '') <> ''
  from public.pages p
  where p.is_published and p.slug <> 'home'

  union all

  -- Categories
  select '/c/' || c.slug,
         c.updated_at,
         0.7::numeric,
         'weekly'::text,
         coalesce(nullif(trim(c.name_ar), ''), '') <> ''
  from public.categories c
  where c.is_visible

  union all

  -- Products
  select '/product/' || pr.slug,
         pr.updated_at,
         0.8::numeric,
         'weekly'::text,
         coalesce(nullif(trim(pr.name_ar), ''), '') <> ''
  from public.products pr
  where pr.is_published
$$;

grant execute on function public.sitemap_entries() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Metadata for one path, used by the crawler meta-injector.
--
-- Social crawlers do not run JavaScript, so without this a shared link shows a
-- blank card — and almost all traffic here arrives as a shared link (D-173).
-- ---------------------------------------------------------------------------
create or replace function public.seo_for_path(p_path text, p_locale text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_ar      boolean := p_locale = 'ar';
  v_slug    text;
  v_result  jsonb;
  v_brand   text;
begin
  select coalesce(value #>> '{}', 'YAKOUB BIG BOSS') into v_brand
  from public.settings where key = 'business.name';
  v_brand := coalesce(v_brand, 'YAKOUB BIG BOSS');

  -- Product
  if p_path like '/product/%' then
    v_slug := substring(p_path from 10);
    select jsonb_build_object(
      'title', coalesce(
        nullif(case when v_ar then pr.meta_title_ar else pr.meta_title_fr end, ''),
        nullif(case when v_ar then pr.name_ar else pr.name_fr end, ''),
        pr.name_fr) || ' · ' || v_brand,
      'description', coalesce(
        nullif(case when v_ar then pr.meta_description_ar else pr.meta_description_fr end, ''),
        left(coalesce(case when v_ar then pr.description_ar else pr.description_fr end,
                      pr.description_fr, ''), 160)),
      'image', (
        select m.storage_path from public.product_media pm
        join public.media m on m.id = pm.media_id
        where pm.product_id = pr.id
        order by pm.is_featured desc, pm.sort_order limit 1),
      'type', 'product',
      'price', coalesce(pr.sale_price, pr.original_price),
      'available', exists (
        select 1 from public.product_variants v
        where v.product_id = pr.id and v.is_active and v.stock_on_hand > 0),
      'has_ar', coalesce(nullif(trim(pr.name_ar), ''), '') <> ''
    ) into v_result
    from public.products pr
    where pr.slug = v_slug and pr.is_published;

  -- Category
  elsif p_path like '/c/%' then
    v_slug := substring(p_path from 4);
    select jsonb_build_object(
      'title', coalesce(nullif(case when v_ar then c.meta_title_ar else c.meta_title_fr end, ''),
                        nullif(case when v_ar then c.name_ar else c.name_fr end, ''),
                        c.name_fr) || ' · ' || v_brand,
      'description', coalesce(
        nullif(case when v_ar then c.meta_description_ar else c.meta_description_fr end, ''),
        left(coalesce(case when v_ar then c.description_ar else c.description_fr end,
                      c.description_fr, ''), 160)),
      'image', (select m.storage_path from public.media m where m.id = c.media_id),
      'type', 'website',
      'has_ar', coalesce(nullif(trim(c.name_ar), ''), '') <> ''
    ) into v_result
    from public.categories c
    where c.slug = v_slug and c.is_visible;

  -- CMS pages, including home
  else
    v_slug := case when p_path in ('', '/') then 'home' else substring(p_path from 4) end;
    select jsonb_build_object(
      'title', coalesce(nullif(case when v_ar then p.meta_title_ar else p.meta_title_fr end, ''),
                        nullif(case when v_ar then p.title_ar else p.title_fr end, ''),
                        p.title_fr) ||
               case when p.slug = 'home' then '' else ' · ' || v_brand end,
      'description', coalesce(
        nullif(case when v_ar then p.meta_description_ar else p.meta_description_fr end, ''), ''),
      'image', (select m.storage_path from public.media m where m.id = p.og_media_id),
      'type', 'website',
      'has_ar', coalesce(nullif(trim(p.title_ar), ''), '') <> ''
    ) into v_result
    from public.pages p
    where p.slug = v_slug and p.is_published;
  end if;

  -- A missing page must still produce a usable card rather than a blank one.
  return coalesce(v_result, jsonb_build_object(
    'title', v_brand, 'description', '', 'image', null,
    'type', 'website', 'has_ar', true));
end;
$$;

grant execute on function public.seo_for_path(text, text) to anon, authenticated;

select 'phase 10 seo functions ready' as status;
