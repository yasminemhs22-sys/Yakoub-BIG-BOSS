-- =============================================================================
-- SEED EVERYTHING — geography, delivery prices, taxonomy, homepage
-- Paste ONCE into the Supabase SQL Editor, after DATABASE_COMPLETE.sql
-- Safe to re-run.
-- =============================================================================

-- =============================================================================
-- SEED 1 of 2 — GEOGRAPHY AND DELIVERY PRICING
--
-- Run in the Supabase SQL Editor. Safe to re-run.
--
-- ⚠️ READ THIS BEFORE RUNNING
--
-- 1. WILAYA CODES use the official numbering (Timimoun = 49), per D-296. That
--    decision is PROVISIONAL: if your delivery company numbers wilayas
--    differently, the codes here must be corrected. The NAME is what the courier
--    reads on your dashboard, so a wrong code costs you nothing today — it
--    matters only if you later connect a courier API.
--
-- 2. COMMUNES: one per wilaya, the administrative capital. NOT the full 1,541.
--
--    I will not invent 1,540 commune names — a wrong commune is an
--    undeliverable parcel, and a plausible-looking wrong name is worse than a
--    missing one. This gives you a working checkout in every wilaya today; add
--    the communes you actually deliver to from the dashboard, or import a
--    verified dataset later. See docs/DEPLOYMENT.md §5.
--
-- 3. DELIVERY PRICES are realistic starting values, not your prices. Set your
--    own in the dashboard: Livraison.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- WILAYAS — 58, official numbering
-- -----------------------------------------------------------------------------
insert into public.wilayas (code, name_fr, name_ar, is_deep_south) values
  (1,  'Adrar',              'أدرار',            true),
  (2,  'Chlef',              'الشلف',            false),
  (3,  'Laghouat',           'الأغواط',          true),
  (4,  'Oum El Bouaghi',     'أم البواقي',       false),
  (5,  'Batna',              'باتنة',            false),
  (6,  'Béjaïa',             'بجاية',            false),
  (7,  'Biskra',             'بسكرة',            false),
  (8,  'Béchar',             'بشار',             true),
  (9,  'Blida',              'البليدة',          false),
  (10, 'Bouira',             'البويرة',          false),
  (11, 'Tamanrasset',        'تمنراست',          true),
  (12, 'Tébessa',            'تبسة',             false),
  (13, 'Tlemcen',            'تلمسان',           false),
  (14, 'Tiaret',             'تيارت',            false),
  (15, 'Tizi Ouzou',         'تيزي وزو',         false),
  (16, 'Alger',              'الجزائر',          false),
  (17, 'Djelfa',             'الجلفة',           false),
  (18, 'Jijel',              'جيجل',             false),
  (19, 'Sétif',              'سطيف',             false),
  (20, 'Saïda',              'سعيدة',            false),
  (21, 'Skikda',             'سكيكدة',           false),
  (22, 'Sidi Bel Abbès',     'سيدي بلعباس',      false),
  (23, 'Annaba',             'عنابة',            false),
  (24, 'Guelma',             'قالمة',            false),
  (25, 'Constantine',        'قسنطينة',          false),
  (26, 'Médéa',              'المدية',           false),
  (27, 'Mostaganem',         'مستغانم',          false),
  (28, 'M''Sila',            'المسيلة',          false),
  (29, 'Mascara',            'معسكر',            false),
  (30, 'Ouargla',            'ورقلة',            true),
  (31, 'Oran',               'وهران',            false),
  (32, 'El Bayadh',          'البيض',            true),
  (33, 'Illizi',             'إليزي',            true),
  (34, 'Bordj Bou Arreridj', 'برج بوعريريج',     false),
  (35, 'Boumerdès',          'بومرداس',          false),
  (36, 'El Tarf',            'الطارف',           false),
  (37, 'Tindouf',            'تندوف',            true),
  (38, 'Tissemsilt',         'تيسمسيلت',         false),
  (39, 'El Oued',            'الوادي',           true),
  (40, 'Khenchela',          'خنشلة',            false),
  (41, 'Souk Ahras',         'سوق أهراس',        false),
  (42, 'Tipaza',             'تيبازة',           false),
  (43, 'Mila',               'ميلة',             false),
  (44, 'Aïn Defla',          'عين الدفلى',       false),
  (45, 'Naâma',              'النعامة',          true),
  (46, 'Aïn Témouchent',     'عين تموشنت',       false),
  (47, 'Ghardaïa',           'غرداية',           true),
  (48, 'Relizane',           'غليزان',           false),
  (49, 'Timimoun',           'تيميمون',          true),
  (50, 'Bordj Badji Mokhtar','برج باجي مختار',   true),
  (51, 'Ouled Djellal',      'أولاد جلال',       true),
  (52, 'Béni Abbès',         'بني عباس',         true),
  (53, 'In Salah',           'عين صالح',         true),
  (54, 'In Guezzam',         'عين قزام',         true),
  (55, 'Touggourt',          'تقرت',             true),
  (56, 'Djanet',             'جانت',             true),
  (57, 'El M''Ghair',        'المغير',           true),
  (58, 'El Meniaa',          'المنيعة',          true)
on conflict (code) do update
  set name_fr = excluded.name_fr,
      name_ar = excluded.name_ar,
      is_deep_south = excluded.is_deep_south;

-- -----------------------------------------------------------------------------
-- COMMUNES — the administrative capital of each wilaya.
--
-- One per wilaya, so checkout works everywhere from day one. Add the communes
-- you actually deliver to from the dashboard.
-- -----------------------------------------------------------------------------
insert into public.communes (wilaya_id, name_fr, name_ar)
select w.id, w.name_fr, w.name_ar
from public.wilayas w
on conflict (wilaya_id, name_fr) do nothing;

-- A few extras for Boumerdès, since that is where the shop is and where most
-- early orders will come from.
insert into public.communes (wilaya_id, name_fr, name_ar)
select w.id, c.name_fr, c.name_ar
from public.wilayas w
cross join (values
  ('Boudouaou',        'بودواو'),
  ('Boudouaou El Bahri','بودواو البحري'),
  ('Ouled Moussa',     'أولاد موسى'),
  ('Khemis El Khechna','خميس الخشنة'),
  ('Reghaïa',          'رغاية'),
  ('Corso',            'قورصو'),
  ('Thenia',           'الثنية'),
  ('Bordj Menaïel',    'برج منايل'),
  ('Dellys',           'دلس'),
  ('Naciria',          'الناصرية')
) as c(name_fr, name_ar)
where w.code = 35
on conflict (wilaya_id, name_fr) do nothing;

-- Alger, the second most likely destination.
insert into public.communes (wilaya_id, name_fr, name_ar)
select w.id, c.name_fr, c.name_ar
from public.wilayas w
cross join (values
  ('Bab Ezzouar',   'باب الزوار'),
  ('Dar El Beïda',  'الدار البيضاء'),
  ('Rouiba',        'الرويبة'),
  ('El Harrach',    'الحراش'),
  ('Hussein Dey',   'حسين داي'),
  ('Bir Mourad Raïs','بير مراد رايس'),
  ('Cheraga',       'الشراقة'),
  ('Draria',        'درارية'),
  ('Birtouta',      'برتوتة'),
  ('Baraki',        'براقي')
) as c(name_fr, name_ar)
where w.code = 16
on conflict (wilaya_id, name_fr) do nothing;

-- -----------------------------------------------------------------------------
-- DELIVERY PRICES — starting values. Set your own in the dashboard.
--
-- Tiered because that is how Algerian couriers actually price: the shop's own
-- wilaya is cheapest, the deep south costs roughly double.
-- -----------------------------------------------------------------------------
insert into public.delivery_prices (wilaya_id, commune_id, delivery_method_id, price)
select w.id,
       null,
       m.id,
       case
         when w.code = 35 then case m.code when 'bureau' then 250 else 350 end
         when w.code in (16, 9, 42, 15, 10, 6) then
           case m.code when 'bureau' then 350 else 500 end
         when w.is_deep_south then
           case m.code when 'bureau' then 800 else 1200 end
         else case m.code when 'bureau' then 450 else 650 end
       end
from public.wilayas w
cross join public.delivery_methods m
on conflict (wilaya_id, commune_id, delivery_method_id) do nothing;

-- -----------------------------------------------------------------------------
-- Verify
-- -----------------------------------------------------------------------------
select
  (select count(*) from public.wilayas)  as wilayas,
  (select count(*) from public.communes) as communes,
  (select count(*) from public.delivery_prices) as prices,
  (select count(*) from public.wilayas w
     where not exists (
       select 1 from public.delivery_prices p
       where p.wilaya_id = w.id and p.commune_id is null)) as wilayas_without_price;

-- >>>>>>>>>>>>>>>>>>>> demo content <<<<<<<<<<<<<<<<<<<<

-- =============================================================================
-- SEED 2 of 2 — CATALOGUE TAXONOMY AND HOMEPAGE
--
-- Run after 0002_geography.sql. Safe to re-run.
--
-- Everything here is a STARTING POINT, fully editable and deletable from the
-- dashboard. Nothing is hardcoded in the application — that was the point of
-- D-070, D-071, D-072 and D-130.
--
-- Images are NOT seeded: files must be uploaded through Contenu → Médiathèque.
-- The homepage blocks below reference no media, so they render correctly while
-- empty and improve the moment you add photographs.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- CATEGORIES — men's clothing, matching what the shop actually sells
-- -----------------------------------------------------------------------------
insert into public.categories (slug, name_fr, name_ar, sort_order, is_visible) values
  ('t-shirts',    'T-shirts',        'تيشيرتات',       10, true),
  ('chemises',    'Chemises',        'قمصان',          20, true),
  ('pantalons',   'Pantalons',       'بناطيل',         30, true),
  ('jeans',       'Jeans',           'جينز',           40, true),
  ('shorts',      'Shorts',          'شورتات',         50, true),
  ('survetements','Survêtements',    'بدلات رياضية',   60, true),
  ('polos',       'Polos',           'بولو',           70, true),
  ('vestes',      'Vestes',          'جاكيتات',        80, true),
  ('chaussures',  'Chaussures',      'أحذية',          90, true),
  ('accessoires', 'Accessoires',     'إكسسوارات',     100, true)
on conflict (slug) do update
  set name_fr = excluded.name_fr,
      name_ar = excluded.name_ar,
      sort_order = excluded.sort_order;

-- -----------------------------------------------------------------------------
-- SIZES
--
-- Two systems plus one-size, because a shop selling t-shirts AND shoes needs
-- both and the schema allows a different set per product (D-071).
-- -----------------------------------------------------------------------------
insert into public.sizes (label_fr, label_ar, size_group, sort_order) values
  ('XS',  'XS',  'alpha',    10),
  ('S',   'S',   'alpha',    20),
  ('M',   'M',   'alpha',    30),
  ('L',   'L',   'alpha',    40),
  ('XL',  'XL',  'alpha',    50),
  ('XXL', 'XXL', 'alpha',    60),
  ('3XL', '3XL', 'alpha',    70),
  ('38',  '38',  'numeric',  10),
  ('39',  '39',  'numeric',  20),
  ('40',  '40',  'numeric',  30),
  ('41',  '41',  'numeric',  40),
  ('42',  '42',  'numeric',  50),
  ('43',  '43',  'numeric',  60),
  ('44',  '44',  'numeric',  70),
  ('45',  '45',  'numeric',  80),
  ('Taille unique', 'مقاس واحد', 'one_size', 10)
on conflict (size_group, label_fr) do update
  set label_ar = excluded.label_ar, sort_order = excluded.sort_order;

-- -----------------------------------------------------------------------------
-- COLOURS — hex values drive the swatches on the product page (D-073)
-- -----------------------------------------------------------------------------
insert into public.colors (name_fr, name_ar, hex_value, sort_order) values
  ('Noir',        'أسود',        '#000000', 10),
  ('Blanc',       'أبيض',        '#FFFFFF', 20),
  ('Gris',        'رمادي',       '#808080', 30),
  ('Gris chiné',  'رمادي فاتح',  '#B0B0B0', 40),
  ('Bleu marine', 'كحلي',        '#1B2A4A', 50),
  ('Bleu ciel',   'أزرق فاتح',   '#6BA8D8', 60),
  ('Beige',       'بيج',         '#D9C7A7', 70),
  ('Marron',      'بني',         '#5C4033', 80),
  ('Vert',        'أخضر',        '#2E5B3A', 90),
  ('Vert olive',  'زيتي',        '#6B7B3A', 100),
  ('Rouge',       'أحمر',        '#B22222', 110),
  ('Bordeaux',    'خمري',        '#6D2B3A', 120)
on conflict (name_fr) do update
  set name_ar = excluded.name_ar,
      hex_value = excluded.hex_value,
      sort_order = excluded.sort_order;

-- -----------------------------------------------------------------------------
-- HOMEPAGE BLOCKS
--
-- Bilingual, ordered, and all editable from Contenu. Every block renders
-- correctly with no image; add photographs and they get better.
--
-- Deleted and re-inserted so re-running gives a clean, predictable homepage
-- rather than duplicates.
-- -----------------------------------------------------------------------------
delete from public.content_blocks
where page_id = (select id from public.pages where slug = 'home');

insert into public.content_blocks (page_id, block_type, position, is_visible, data)
select p.id, b.block_type, b.position, true, b.data
from public.pages p
cross join (values
  ('announcement', 0, jsonb_build_object(
     'text', jsonb_build_object(
       'fr', 'Livraison dans les 58 wilayas · Paiement à la livraison',
       'ar', 'التوصيل إلى 58 ولاية · الدفع عند الاستلام'),
     'link', jsonb_build_object('type','none','value',''),
     'dismissible', true)),

  ('hero', 1, jsonb_build_object(
     'media_id', null,
     'headline', jsonb_build_object('fr','YAKOUB BIG BOSS','ar','YAKOUB BIG BOSS'),
     'subheadline', jsonb_build_object(
       'fr','Vêtements homme · Hlaimia, Boudouaou, Boumerdès',
       'ar','ملابس رجالية · حلايمية، بودواو، بومرداس'),
     'cta', jsonb_build_object(
       'type','url','value','/fr/c/t-shirts',
       'label', jsonb_build_object('fr','Voir la boutique','ar','تصفح المتجر')),
     'overlay', 60)),

  ('category_strip', 2, jsonb_build_object(
     'title', jsonb_build_object('fr','Nos catégories','ar','أقسامنا'),
     'category_ids', '[]'::jsonb)),

  ('product_carousel', 3, jsonb_build_object(
     'title', jsonb_build_object('fr','Nouveautés','ar','وصل حديثاً'),
     'product_ids', '[]'::jsonb,
     'source', 'new_arrivals',
     'limit', 8)),

  ('trust_strip', 4, jsonb_build_object(
     'items', jsonb_build_array(
       jsonb_build_object(
         'icon','delivery',
         'title', jsonb_build_object('fr','58 wilayas','ar','58 ولاية'),
         'text',  jsonb_build_object('fr','Bureau ou à domicile','ar','مكتب أو إلى المنزل')),
       jsonb_build_object(
         'icon','cash',
         'title', jsonb_build_object('fr','Paiement à la livraison','ar','الدفع عند الاستلام'),
         'text',  jsonb_build_object('fr','Vous payez en recevant','ar','تدفع عند الاستلام')),
       jsonb_build_object(
         'icon','quality',
         'title', jsonb_build_object('fr','Qualité vérifiée','ar','جودة مضمونة'),
         'text',  jsonb_build_object('fr','Choisis un par un','ar','مُنتقاة قطعة قطعة')),
       jsonb_build_object(
         'icon','whatsapp',
         'title', jsonb_build_object('fr','Commandez sur WhatsApp','ar','اطلب عبر واتساب'),
         'text',  jsonb_build_object('fr','0563876210','ar','0563876210'))))),

  ('product_carousel', 5, jsonb_build_object(
     'title', jsonb_build_object('fr','En promotion','ar','تخفيضات'),
     'product_ids', '[]'::jsonb,
     'source', 'on_sale',
     'limit', 8)),

  ('store_presence', 6, jsonb_build_object(
     'media_id', null,
     'title', jsonb_build_object('fr','Venez au magasin','ar','زورونا في المحل'),
     'address', jsonb_build_object(
       'fr','Hlaimia, Boudouaou, Boumerdès — en face de la mosquée Hassan Ben Thabit',
       'ar','حلايمية، بودواو، بومرداس — أمام مسجد حسان بن ثابت'),
     'map_url', '',
     'show_phone', true,
     'show_whatsapp', true))
) as b(block_type, position, data)
where p.slug = 'home';

-- The homepage must be published or the storefront falls back to a bare product
-- list instead of these blocks.
update public.pages set is_published = true where slug = 'home';

-- -----------------------------------------------------------------------------
-- Main menu — the header links, editable from the dashboard
-- -----------------------------------------------------------------------------
delete from public.menu_items
where menu_id = (select id from public.menus where code = 'main');

insert into public.menu_items (menu_id, label_fr, label_ar, link_type, category_id, position, is_visible)
select m.id, c.name_fr, c.name_ar, 'category', c.id, c.sort_order, true
from public.menus m
cross join public.categories c
where m.code = 'main'
  and c.slug in ('t-shirts','chemises','jeans','survetements','chaussures');

-- -----------------------------------------------------------------------------
-- Verify
-- -----------------------------------------------------------------------------
select
  (select count(*) from public.categories)     as categories,
  (select count(*) from public.sizes)          as sizes,
  (select count(*) from public.colors)         as colors,
  (select count(*) from public.content_blocks) as homepage_blocks,
  (select count(*) from public.menu_items)     as menu_items,
  (select is_published from public.pages where slug = 'home') as home_published;
