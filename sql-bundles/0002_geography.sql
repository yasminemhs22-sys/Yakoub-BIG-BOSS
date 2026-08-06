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
