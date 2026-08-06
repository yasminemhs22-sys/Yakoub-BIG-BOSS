# Schema Review — 33 Tables

**Approved by the Product Owner.** Version 1.1 · Phase 1

Changes since v1.0: `menus` kept · product↔category is now many-to-many via
`product_categories` · curated shelf stays a CMS block · phone rules configurable.

Legend for RLS: **PUB** = anonymous read · **ADM** = any active admin ·
**PERM** = specific permission required · **NONE** = no read access for anyone
except through a `SECURITY DEFINER` function.

---

## A. Geography & Delivery — 5 tables

| # | Table | Purpose | Key relationships | RLS |
|---|---|---|---|---|
| 1 | `wilayas` | The 58 provinces. `code` (1–58) is the identity that matters — names drift between sources, codes do not | ← `communes`, `delivery_prices`, `orders` | **PUB** read (active only) · write: `delivery.manage` |
| 2 | `communes` | Municipalities. Used for the customer's address and dispatch, not for pricing in V1 | → `wilayas` · ← `orders`, `delivery_prices` | **PUB** read (active only) · write: `delivery.manage` |
| 3 | `delivery_methods` | Bureau / À domicile. Data, not an enum, so a third method needs no deployment | ← `delivery_prices`, `orders` | **PUB** read · write: `delivery.manage` |
| 4 | `delivery_prices` | Two prices per wilaya. `commune_id` nullable for future overrides | → `wilayas`, `communes`, `delivery_methods` | **PUB** read (the estimator and live total need it) · write: `delivery.manage` · **audited** |
| 5 | `delivery_companies` | Yalidine / ZR / Noest / Custom. Labels the admin picks per order | ← `orders` | **PUB** read · write: `delivery.manage` |

---

## B. Identity & Access — 5 tables

| # | Table | Purpose | Key relationships | RLS |
|---|---|---|---|---|
| 6 | `roles` | Super Admin, Administrator, Content Manager, extensible | ← `admin_users`, `role_permissions` | **PERM** `roles.manage` · no anon access |
| 7 | `permissions` | 14 granular permissions | ← `role_permissions` | **PERM** `roles.manage` |
| 8 | `role_permissions` | Role → permission mapping. This is what makes a new role a row, not a deployment | → `roles`, `permissions` | **PERM** `roles.manage` · **audited** |
| 9 | `admin_users` | Staff accounts. `id` = `auth.users.id`. Storefront is anonymous | → `auth.users`, `roles` | **PERM** `admins.manage`, **plus** every admin may read their own row · **audited** |
| 10 | `audit_log` | Every administrative write: actor, before, after | → (soft) any entity | **PERM** `audit.view` · **append-only**, no INSERT/UPDATE/DELETE grant to anyone |

---

## C. CMS — 6 tables

| # | Table | Purpose | Key relationships | RLS |
|---|---|---|---|---|
| 11 | `media` | Reusable file index. Storage holds the bytes. `media_type` present from day one so video needs no migration | ← `product_media`, `categories`, `pages` | **PUB** read · write: `content.manage` |
| 12 | `settings` | Business info, hours, social, thresholds. Key/value so a new setting never needs a migration | — | **PUB** read **only** where `is_public` · write: `settings.manage` · **audited** |
| 13 | `pages` | Home, legal pages, contact. Bilingual SEO metadata per language | ← `content_blocks`, `menu_items` | **PUB** read (published only) · write: `content.manage` · **audited** |
| 14 | `content_blocks` | Typed, validated blocks. **Never raw HTML** — that would allow layout breakage and stored XSS | → `pages` | **PUB** read (visible + page published) · write: `content.manage` · **audited** |
| 15 | `menus` | Named menus: `main`, `footer` | ← `menu_items` | **PUB** read · write: `content.manage` |
| 16 | `menu_items` | Nav entries, self-nesting, linking to a page, category or URL | → `menus`, `menu_items`, `pages`, `categories` | **PUB** read (visible only) · write: `content.manage` · **audited** |

---

## D. Catalogue — 6 tables

| # | Table | Purpose | Key relationships | RLS |
|---|---|---|---|---|
| 17 | `categories` | Admin-managed tree, cycle-protected | → self, `media` · ← `products` | **PUB** read (visible only) · write: `catalogue.manage` · **audited** |
| 18 | `sizes` | Admin-created. `size_group` + `sort_order` so XXL never sorts before S | ← `product_variants` | **PUB** read (active only) · write: `catalogue.manage` |
| 19 | `colors` | Admin-created, with hex for swatches | ← `product_variants` | **PUB** read (active only) · write: `catalogue.manage` |
| 20 | `products` | Original price required, sale price optional and constrained below it | ← `product_categories`, `product_media`, `product_variants` | **PUB** read (published only) · write: `catalogue.manage` · **audited** |
| 20b | `product_categories` | **Many-to-many** product↔category. `is_primary` gives breadcrumbs and the canonical URL exactly one category | → `products`, `categories` | **PUB** read via published product · write: `catalogue.manage` |
| 21 | `product_media` | Unlimited images, ordered, exactly one featured (partial unique index) | → `products`, `media` | **PUB** read via published product · write: `catalogue.manage` |
| 22 | `product_variants` | **The sellable unit.** Colour × size, both nullable. Stock lives here, never on the product | → `products`, `colors`, `sizes`, `product_media` | **PUB** read (active + published) · write: `catalogue.manage` · **audited** |

---

## E. Inventory — 1 table

| # | Table | Purpose | Key relationships | RLS |
|---|---|---|---|---|
| 23 | `stock_movements` | Append-only ledger. Source of truth; `variants.stock_on_hand` is a trigger-maintained cache | → `product_variants`, `orders`, `admin_users` | **PERM** `inventory.manage` · **no anon** · UPDATE/DELETE revoked from everyone |

---

## F. Orders — 6 tables

| # | Table | Purpose | Key relationships | RLS |
|---|---|---|---|---|
| 24 | `order_statuses` | The 12 statuses as data, with bilingual labels and stock flags | ← `orders`, transitions, timeline | **PUB** read (tracking page needs labels) · write: `settings.manage` |
| 25 | `order_status_transitions` | Which status may follow which. Workflow is configuration, not code | → `order_statuses` | **PUB** read · write: `settings.manage` |
| 26 | `orders` | Guest orders. All money snapshotted and computed server-side | → 6 tables · ← items, timeline | **NONE** for anon · **PERM** `orders.view` · **audited** |
| 27 | `order_items` | Snapshotted lines. `variant_id` is SET NULL so deleting a product cannot destroy history | → `orders`, `product_variants` | **NONE** for anon · **PERM** `orders.view` |
| 28 | `order_timeline` | Admin, date, time, optional note on every action | → `orders`, `admin_users`, statuses | **NONE** for anon · **PERM** `orders.view` · **append-only** |
| 29 | `phone_blocklist` | Fed automatically when an order is marked `fake` | → `admin_users` | **NONE** for anon · **PERM** `orders.view` · **audited** |

---

## G. Operations — 3 tables

| # | Table | Purpose | Key relationships | RLS |
|---|---|---|---|---|
| 30 | `order_submission_log` | Rate limiting. There is no Redis in this stack, so limits are enforced against this table | — | **NONE** — written only by `place_order()` |
| 31 | `sheets_sync_queue` | One live row per order. A Sheets failure never blocks confirmation | → `orders` | **NONE** for anon · **PERM** `orders.view` |
| 32 | `build_requests` | Debounced Netlify rebuilds on CMS publish, with status visible in the dashboard | → `admin_users` | **ADM** read · write: `content.manage` |

---

## Self-critique — tables I would question

Applying your own simplicity rule to my own work.

### `menus` (#15) — raised, and kept by decision

**Resolved:** the Product Owner elected to keep it. Reasoning below is retained
for the record.

#### Original concern

Only two menus will ever exist: `main` and `footer`. The table holds two rows and
exists only to give `menu_items` something to point at.

**Alternative:** drop `menus`, put a `menu_code` text column on `menu_items` with
a `CHECK`. One table instead of two.

**Argument to keep it:** if the admin later wants a third menu (a mobile drawer
with different entries, or a seasonal promo bar), it is a row rather than a
migration — and unlike the tables we deleted, this one is *not* empty in V1.

**Outcome: kept** (D-294).

### Tables I checked and consider justified

| Table | Why it earns its place in V1 |
|---|---|
| `order_status_transitions` | D-264 requires legal-transition validation. Hardcoding the graph would put workflow in code |
| `order_submission_log` | Rate limiting has nowhere else to live without Redis. Not future-proofing — the fraud risk is present on day one |
| `build_requests` | D-253 requires visible rebuild status and a manual trigger |
| `permissions` + `role_permissions` | D-114. Three roles exist today and the oversell override already needs granularity |
| `delivery_companies` | Referenced by FK from `orders`; a settings array cannot be a foreign key |

---

## Entities deliberately absent — confirm you agree

| Not present | Why | If you disagree |
|---|---|---|
| **A `collections` table** | The curated shelf ("Choix du Boss") is a `product_carousel` content block holding product ids in its `data` | Confirm this is acceptable. It keeps curation in the CMS where the admin already works |
| **Customer accounts** | Deferred (§31.5). Retrofit = nullable `customer_id` on `orders` |  |
| **Promo codes** | Deferred (§31.5) |  |
| **Notifications outbox** | Deferred (D-286). Timeline already records calls |  |
| **Courier aliases** | Deferred (D-285) |  |
| **Storage bucket policies** | Phase 4, when buckets exist |  |

---

## Counts at a glance

| Domain | Tables |
|---|---|
| Geography & delivery | 5 |
| Identity & access | 5 |
| CMS | 6 |
| Catalogue | 7 |
| Inventory | 1 |
| Orders | 6 |
| Operations | 3 |
| **Total** | **33** |

**No anon read at all:** `orders`, `order_items`, `order_timeline`,
`phone_blocklist`, `order_submission_log`, `audit_log`, `admin_users`,
`stock_movements`, `sheets_sync_queue`, `roles`, `permissions`,
`role_permissions` — 12 tables.

**Append-only:** `audit_log`, `stock_movements`, `order_timeline`.

**Audited:** 12 tables covering money, catalogue, content, access and orders.
