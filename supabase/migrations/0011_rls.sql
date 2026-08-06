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

-- app schema is internal, with two deliberate exceptions.
revoke all on all functions in schema app from anon, authenticated;

-- The dashboard must be able to ask "what may I do?" in order to hide controls
-- the signed-in admin is not allowed to use. Both functions report only on the
-- CALLER: current_admin_id() returns the caller's own id or null, and
-- has_permission() answers yes/no about the caller. Neither exposes data nor
-- grants anything (D-300). anon receives nothing.
grant usage on schema app to authenticated;
grant execute on function app.has_permission(text)  to authenticated;
grant execute on function app.current_admin_id()    to authenticated;
