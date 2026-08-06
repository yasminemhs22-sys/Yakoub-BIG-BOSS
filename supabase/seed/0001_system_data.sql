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
