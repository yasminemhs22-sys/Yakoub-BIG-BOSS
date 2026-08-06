# Deployment Guide

From an empty Supabase project to a live shop. Roughly 90 minutes, most of it
waiting.

Work through it in order. Each step assumes the previous one succeeded.

---

## 1. Supabase project

Create the project. **Region: Frankfurt (eu-central-1)** — the closest available
to Algeria, and it cannot be changed later.

Confirm the version:

```sql
select current_setting('server_version_num')::int >= 150000 as pg15_or_later;
```

Must be `true`. If it is not, apply
`supabase/migrations/0005b_variant_uniqueness_pg14_fallback.sql` **instead of**
the constraint in `0005`, and stop to check nothing else depends on PG 15.

---

## 2. Apply the database

In the SQL Editor, run each file **in order, once**:

```
migrations/0001_foundation.sql        → helpers, audit infrastructure
migrations/0002_geography_delivery.sql
migrations/0003_identity.sql          → roles, permissions, admins
migrations/0004_cms.sql
migrations/0005_catalogue.sql
migrations/0006_inventory.sql         → stock ledger
migrations/0007_orders.sql
migrations/0008_integrations.sql
migrations/0009_functions.sql         → confirm_order, transitions
migrations/0010_place_order.sql
migrations/0011_rls.sql               → security policies
migrations/0012_auth_helpers.sql
migrations/0013_storage.sql           → media bucket
migrations/0014_sheets_sync.sql
migrations/0015_seo.sql
migrations/0016_hardening.sql

seed/0001_system_data.sql             → statuses, roles, settings, pages
```

**Do not run** `0005b` unless step 1 told you to.
**Do not run** `seed/0002_geography.PENDING.sql` — it refuses to execute, by
design. See step 5.

Verify:

```sql
select
  (select count(*) from information_schema.tables
     where table_schema='public' and table_type='BASE TABLE') as tables,
  (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
     where n.nspname='public' and c.relkind='r' and not c.relrowsecurity) as rls_off,
  (select count(*) from public.order_statuses) as statuses,
  (select count(*) from public.permissions) as permissions;
```

Expected: **33 · 0 · 12 · 14**. `rls_off` must be zero — anything else means a
table readable by anyone holding the public key.

---

## 3. Administrator accounts

**Authentication → Users → Add user** (use *Create new user*, not *Invite*, and
tick **Auto Confirm User**).

Then link each account to a role:

```sql
insert into public.admin_users (id, role_id, full_name, email)
select u.id,
       (select id from public.roles where code = 'super_admin'),
       initcap(split_part(u.email, '@', 1)), u.email
from auth.users u
on conflict (id) do nothing;

select au.full_name, au.email, r.code
from public.admin_users au join public.roles r on r.id = au.role_id;
```

A Supabase account with no `admin_users` row cannot enter the dashboard — the
session alone is not authorisation.

Roles available: `super_admin` (everything) · `administrator` (runs the shop,
cannot manage access or oversell) · `content_manager` (content only, cannot see
a single customer record).

---

## 4. Verification suite — before anything real exists

```
supabase/tests/00_harness.sql     ← commits, installs the harness
supabase/tests/01_structure_and_functions.sql
supabase/tests/02_constraints_and_triggers.sql
supabase/tests/03_order_lifecycle.sql
supabase/tests/04_rls_security.sql
```

Files 01–04 each roll themselves back and leave nothing behind. Every one must
report zero failures.

**Then the concurrency test** — `supabase/tests/05_concurrency_MANUAL.md`. Two
genuinely concurrent sessions, via `psql` or DBeaver. This is a **mandatory
pre-production requirement** and the one item still unproven.

Afterwards: `supabase/tests/99_uninstall.sql`.

---

## 5. Geography

Blocked pending verification. Two numbering schemes for wilayas 49–58 circulate
in public datasets, and we store the **code**, not the name — seeding the wrong
one gives ten wilayas the wrong delivery price.

1. Confirm the codes against the delivery company you will actually use
2. Cross-check `othmanus/algeria-cities` against `DZBuild-com/dzship`, reviewing
   every disagreement
3. Generate `seed/0002_geography.sql` from the merged data and run it

```sql
select count(*) from public.wilayas;   -- must be 58
select count(*) from public.communes;  -- must be 1541
```

Then set prices for **all 58 wilayas**, both methods. A wilaya with no price
cannot receive an order — `place_order` returns `no_delivery_price`.

---

## 6. Netlify

Connect the repository. Build settings come from `netlify.toml`; nothing to
configure by hand.

**Site settings → Environment variables:**

| Variable | Value |
|---|---|
| `VITE_SUPABASE_URL` | Project URL |
| `VITE_SUPABASE_ANON_KEY` | The **publishable / anon** key |
| `VITE_SITE_URL` | Your domain |
| `SITE_URL` | Same domain — server copy for sitemap and robots |
| `SUPABASE_URL` | Same as above — server copy |
| `SUPABASE_ANON_KEY` | Same as above — server copy |
| `SUPABASE_SERVICE_ROLE_KEY` | **Secret.** Sheets worker only |
| `SYNC_SECRET` | Any random string |

> **Never** prefix a secret with `VITE_`. Anything so prefixed is compiled into
> the browser bundle and is public. The `service_role` key bypasses every
> security policy in this project.

Deploy, then check `https://your-site/robots.txt` and `/sitemap.xml` respond.

---

## 7. Google Sheets

**This is the only step that is genuinely yours** (D-153).

1. Google Cloud Console → new project → enable the **Google Sheets API**
2. Create a **service account**, then a **JSON key**
3. Create the spreadsheet. Copy its ID from the URL
4. **Share the sheet with the service account's email**, as Editor — the most
   commonly missed step
5. Add to Netlify:

| Variable | Value |
|---|---|
| `GOOGLE_SERVICE_ACCOUNT_JSON` | The whole JSON file, on one line |
| `GOOGLE_SHEET_ID` | From the sheet URL |
| `GOOGLE_SHEET_TAB` | `Commandes` |

The worker runs every 5 minutes. It is deliberately **not** triggered by
confirmation: a Google outage must never look like a broken confirm button.

Watch it in the dashboard under **Google Sheets**.

---

## 8. Fonts

Four `.woff2` files into `public/fonts/`. See `docs/FONTS.md`.

The site works without them — text falls back to a system font and looks
plainer, not broken.

---

## 9. Content

Everything below is edited in the dashboard, no deploys:

- **Paramètres** — phone, WhatsApp, email, address FR + AR, map link, socials
- **Contenu** — legal pages (written and published), SEO metadata per language
- **Catalogue → Catégories/tailles/couleurs** — create your own; nothing ships
  with a default list
- **Catalogue** — products, images, variants, stock
- **Livraison** — prices for all 58 wilayas

---

## 10. Pre-launch checklist

- [ ] `select * from public.security_audit;` returns **zero rows**
- [ ] Concurrency test passed with real concurrent sessions
- [ ] One full backup restore rehearsed
- [ ] All 58 wilayas priced
- [ ] Legal pages written and published
- [ ] Test harness uninstalled, test passwords changed
- [ ] `Confirm email` re-enabled in Supabase Auth
- [ ] One order placed, confirmed, and visible in Google Sheets
- [ ] `/ar` mirrors correctly; prices show Western digits in both languages
- [ ] Product page opens under 3 seconds on a real phone on mobile data
