# Database Schema — Phase 1

**Project:** YAKOUB BIG BOSS
**Baseline:** PostgreSQL 15+ (fallback documented — D-290)
**Status:** schema complete · geography seed pending

---

## Migration order

| File | Contents |
|---|---|
| `0001_foundation.sql` | Extensions, `app` schema, helpers, audit infrastructure |
| `0002_geography_delivery.sql` | Wilayas, communes, delivery methods, pricing, companies |
| `0003_identity.sql` | Roles, permissions, admin users |
| `0004_cms.sql` | Media, settings, pages, content blocks, navigation |
| `0005_catalogue.sql` | Categories, sizes, colours, products, product↔category, media links, variants |
| `0005b_..._pg14_fallback.sql` | **Opt-in.** Only if PG ≤ 14 |
| `0006_inventory.sql` | Stock movement ledger |
| `0007_orders.sql` | Statuses, transitions, orders, items, timeline, fraud controls |
| `0008_integrations.sql` | Sheets sync queue, build requests |
| `0009_functions.sql` | SKU, reference, delivery fee, `confirm_order`, `transition_order_status` |
| `0010_place_order.sql` | Public `place_order` and `track_order` |
| `0011_rls.sql` | Row Level Security for all 33 tables |

Seed: `seed/0001_system_data.sql` (idempotent) ·
`seed/0002_geography.PENDING.sql` (**blocked**, raises if run)

---

## Design decisions worth knowing

### Money is never trusted from the client

The cart sends `variant_id` and `quantity`. Nothing else. `place_order()`
resolves every price from the database and computes the total server-side. A
tampered request cannot change what an order costs (D-273, D-274).

### Stock is a ledger, not a counter

`stock_movements` is append-only; `product_variants.stock_on_hand` is a cache
kept in step by trigger. `stock_reconciliation()` proves the two agree. Stock
leaves inventory only inside `confirm_order()` (D-040) and returns only when the
order had actually been confirmed.

### Confirmation is one atomic function

`confirm_order()` locks the order, then the variants in a deterministic order,
validates the transition, checks stock, writes the ledger, moves the status,
appends the timeline and enqueues the Sheets sync — all in one transaction. Two
admins cannot both confirm the last unit: the second waits on the lock and then
fails the stock check (C-04, C-07g).

Out-of-stock returns a structured result naming the short lines, rather than
raising, so the dashboard can show *which* items are short.

### Order snapshots are immutable

`order_items` stores product names, colour, size, SKU and unit price as text and
numbers. `variant_id` is `ON DELETE SET NULL`, so deleting a product can never
destroy order history (D-057).

### Statuses are data, movement types are not

Order statuses need bilingual labels and a configurable workflow, so they live in
a table with a transition table beside them. Stock movement types are internal
accounting categories with no UI and no configurability, so they are a `CHECK`
constraint — a lookup table would add a join to every stock query for nothing
(D-283).

### Uniqueness rules that are easy to get wrong

| Rule | Why |
|---|---|
| `communes (wilaya_id, name)` | Homonym communes exist across wilayas. A global constraint would reject valid rows during seeding and look like dataset corruption (D-280) |
| `product_variants UNIQUE NULLS NOT DISTINCT` | PostgreSQL treats NULLs as distinct by default, so a plain UNIQUE would allow duplicate one-size variants (D-260) |
| `delivery_prices UNIQUE NULLS NOT DISTINCT` | Two wilaya-level rows for the same method would otherwise both be accepted, creating ambiguous pricing |
| `product_media UNIQUE (product_id) WHERE is_featured` | Exactly one featured image, enforced by the database rather than hoped for by the UI (D-272) |
| `product_categories UNIQUE (product_id) WHERE is_primary` | A product may sit in many categories, but breadcrumbs and the canonical URL need exactly one (D-293) |

### Guards that exist because the failure would be silent

- Last active Super Admin cannot be removed — otherwise one careless edit locks
  everyone out with no UI recovery path.
- Category cycles rejected — a loop makes every recursive query hang.
- Commune must belong to its wilaya, on both orders and price overrides.
- Variant image must belong to its own product.
- Products cannot be published without images and variants.
- Deleting the featured image promotes the next by `sort_order`.
- Removing the primary category promotes the next, so breadcrumbs never break.
- A category still assigned to a product cannot be deleted (`ON DELETE RESTRICT`).

---

## Security model

RLS is enabled on all 33 tables.

**Public (anon) read:** active geography, delivery methods and prices, active
sizes and colours, visible categories, published products with their media and
variants, published pages and visible blocks, menus, order status labels, and
**only** settings flagged `is_public`.

**No anon access whatsoever:** `orders`, `order_items`, `order_timeline`,
`phone_blocklist`, `order_submission_log`, `audit_log`, `admin_users`,
`stock_movements`, `sheets_sync_queue`, `roles`, `permissions`,
`role_permissions`. Customers reach their own order only through
`track_order(reference, phone)`, which is `SECURITY DEFINER`.

**Admin read is split by sensitivity.** Catalogue and content are readable by any
active admin; customer data is gated on `orders.view`, stock on
`inventory.manage`, audit on `audit.view`, access control on `roles.manage` /
`admins.manage`. A Content Manager cannot read a single customer phone number.

**Writes** are permission-checked through `app.has_permission()`. There is no
`if role = 'admin'` anywhere.

`FORCE ROW LEVEL SECURITY` is deliberately **not** used — see the note in
`0011_rls.sql`.

---

## Anti-fraud (no payment step means no natural filter)

Inside `place_order()`: honeypot returns a fake success so bots learn nothing ·
phone must normalise to a valid Algerian number · blocklist check with a
deliberately vague rejection message · rate limit 3/hour per phone and 10/hour
per IP · duplicate detection within 2 minutes · cart size bounded.

Marking an order `fake` adds the phone to the blocklist automatically.

---

## Known limitations

1. **Not executed.** No PostgreSQL was available in this environment. See the
   Phase 1 report for exactly what must be tested.
2. **Geography seed is blocked** on wilaya code verification.
3. **`order_submission_log` needs pruning.** Add a scheduled job, or it grows
   without bound.
4. **Rate limiting is database-backed**, not edge-backed. It stops casual abuse,
   not a distributed flood. Netlify-level protection belongs in Phase 11.
5. **`content_blocks.data` shapes are validated in the application**, not the
   database. A `jsonb` schema check per `block_type` could be added later.
6. **No full-text search configuration** for Arabic yet; trigram indexes are in
   place, which covers typo-tolerant matching but not stemming.
