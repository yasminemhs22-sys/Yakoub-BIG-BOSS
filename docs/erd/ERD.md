# ERD — Entity Relationship Reference

**33 tables · 47 foreign keys**
Extracted programmatically from the migration files, not written from memory.

---

## Diagrams

| File | Scope |
|---|---|
| `00_overview.mermaid` | All 33 tables, relationships only |
| `01_catalogue.mermaid` | Categories, products, variants, media — with columns |
| `02_orders_inventory.mermaid` | Geography, delivery, orders, ledger — with columns |
| `03_identity_cms.mermaid` | Roles, permissions, pages, blocks, menus — with columns |

Cardinality notation in the diagrams: `||` exactly one · `|o` zero or one ·
`o{` zero or many · `|{` one or many.

---

## Complete foreign key inventory

| Child table | Column | Parent table | Cardinality | Null | On delete | Why this rule |
|---|---|---|---|---|---|---|
| `admin_users` | `id` | `auth.users` | 1 : 1 | NOT NULL | `CASCADE` | child has no meaning without the parent |
| `admin_users` | `role_id` | `roles` | 1 : N | NOT NULL | `RESTRICT` | deleting the parent would corrupt or orphan real data |
| `build_requests` | `requested_by` | `admin_users` | 0..1 : N | nullable | `SET NULL` | history must survive the parent being deleted |
| `categories` | `media_id` | `media` | 0..1 : N | nullable | `SET NULL` | history must survive the parent being deleted |
| `categories` | `parent_id` | `categories` | 0..1 : N | nullable | `RESTRICT` | deleting the parent would corrupt or orphan real data |
| `communes` | `wilaya_id` | `wilayas` | 1 : N | NOT NULL | `RESTRICT` | deleting the parent would corrupt or orphan real data |
| `content_blocks` | `page_id` | `pages` | 1 : N | NOT NULL | `CASCADE` | child has no meaning without the parent |
| `delivery_prices` | `commune_id` | `communes` | 0..1 : N | nullable | `CASCADE` | child has no meaning without the parent |
| `delivery_prices` | `delivery_method_id` | `delivery_methods` | 1 : N | NOT NULL | `RESTRICT` | deleting the parent would corrupt or orphan real data |
| `delivery_prices` | `wilaya_id` | `wilayas` | 1 : N | NOT NULL | `CASCADE` | child has no meaning without the parent |
| `media` | `created_by` | `admin_users` | 0..1 : N | nullable | `SET NULL` | history must survive the parent being deleted |
| `menu_items` | `category_id` | `categories` | 0..1 : N | nullable | `CASCADE` | child has no meaning without the parent |
| `menu_items` | `menu_id` | `menus` | 1 : N | NOT NULL | `CASCADE` | child has no meaning without the parent |
| `menu_items` | `page_id` | `pages` | 0..1 : N | nullable | `CASCADE` | child has no meaning without the parent |
| `menu_items` | `parent_id` | `menu_items` | 0..1 : N | nullable | `CASCADE` | child has no meaning without the parent |
| `order_items` | `order_id` | `orders` | 1 : N | NOT NULL | `CASCADE` | child has no meaning without the parent |
| `order_items` | `variant_id` | `product_variants` | 0..1 : N | nullable | `SET NULL` | history must survive the parent being deleted |
| `order_status_transitions` | `from_status_id` | `order_statuses` | 0..1 : N | nullable | `CASCADE` | child has no meaning without the parent |
| `order_status_transitions` | `to_status_id` | `order_statuses` | 1 : N | NOT NULL | `CASCADE` | child has no meaning without the parent |
| `order_timeline` | `actor_id` | `admin_users` | 0..1 : N | nullable | `SET NULL` | history must survive the parent being deleted |
| `order_timeline` | `from_status_id` | `order_statuses` | 0..1 : N | nullable | `SET NULL` | history must survive the parent being deleted |
| `order_timeline` | `order_id` | `orders` | 1 : N | NOT NULL | `CASCADE` | child has no meaning without the parent |
| `order_timeline` | `to_status_id` | `order_statuses` | 0..1 : N | nullable | `SET NULL` | history must survive the parent being deleted |
| `orders` | `commune_id` | `communes` | 1 : N | NOT NULL | `RESTRICT` | deleting the parent would corrupt or orphan real data |
| `orders` | `confirmed_by` | `admin_users` | 0..1 : N | nullable | `SET NULL` | history must survive the parent being deleted |
| `orders` | `delivery_company_id` | `delivery_companies` | 0..1 : N | nullable | `SET NULL` | history must survive the parent being deleted |
| `orders` | `delivery_method_id` | `delivery_methods` | 1 : N | NOT NULL | `RESTRICT` | deleting the parent would corrupt or orphan real data |
| `orders` | `status_id` | `order_statuses` | 1 : N | NOT NULL | `RESTRICT` | deleting the parent would corrupt or orphan real data |
| `orders` | `wilaya_id` | `wilayas` | 1 : N | NOT NULL | `RESTRICT` | deleting the parent would corrupt or orphan real data |
| `pages` | `og_media_id` | `media` | 0..1 : N | nullable | `SET NULL` | history must survive the parent being deleted |
| `phone_blocklist` | `created_by` | `admin_users` | 0..1 : N | nullable | `SET NULL` | history must survive the parent being deleted |
| `product_categories` | `category_id` | `categories` | 1 : N | NOT NULL | `RESTRICT` | deleting the parent would corrupt or orphan real data |
| `product_categories` | `product_id` | `products` | 1 : N | NOT NULL | `CASCADE` | child has no meaning without the parent |
| `product_media` | `media_id` | `media` | 1 : N | NOT NULL | `RESTRICT` | deleting the parent would corrupt or orphan real data |
| `product_media` | `product_id` | `products` | 1 : N | NOT NULL | `CASCADE` | child has no meaning without the parent |
| `product_variants` | `color_id` | `colors` | 0..1 : N | nullable | `RESTRICT` | deleting the parent would corrupt or orphan real data |
| `product_variants` | `product_id` | `products` | 1 : N | NOT NULL | `CASCADE` | child has no meaning without the parent |
| `product_variants` | `product_media_id` | `product_media` | 0..1 : N | nullable | `SET NULL` | history must survive the parent being deleted |
| `product_variants` | `size_id` | `sizes` | 0..1 : N | nullable | `RESTRICT` | deleting the parent would corrupt or orphan real data |
| `products` | `created_by` | `admin_users` | 0..1 : N | nullable | `SET NULL` | history must survive the parent being deleted |
| `role_permissions` | `permission_id` | `permissions` | 1 : N | NOT NULL | `CASCADE` | child has no meaning without the parent |
| `role_permissions` | `role_id` | `roles` | 1 : N | NOT NULL | `CASCADE` | child has no meaning without the parent |
| `settings` | `updated_by` | `admin_users` | 0..1 : N | nullable | `SET NULL` | history must survive the parent being deleted |
| `sheets_sync_queue` | `order_id` | `orders` | 1 : N | NOT NULL | `CASCADE` | child has no meaning without the parent |
| `stock_movements` | `actor_id` | `admin_users` | 0..1 : N | nullable | `SET NULL` | history must survive the parent being deleted |
| `stock_movements` | `order_id` | `orders` | 0..1 : N | nullable | `SET NULL` | history must survive the parent being deleted |
| `stock_movements` | `variant_id` | `product_variants` | 1 : N | NOT NULL | `CASCADE` | child has no meaning without the parent |

---

## The `ON DELETE` rules that matter most

These three encode business decisions, not conventions.

### `order_items.variant_id` → `SET NULL`

Deleting a product must **never** destroy order history. The line keeps its
snapshotted name, colour, size, SKU and price as plain text and numbers, so a
two-year-old invoice still reads correctly after the product is gone (D-057).

The confirmation RPC refuses to confirm an order whose variant has vanished,
rather than guessing.

### `product_categories.category_id` → `RESTRICT`

A category still assigned to products cannot be deleted. Without this, deleting
a category would silently strip products from navigation with no warning and no
audit trail.

### `stock_movements.order_id` → `SET NULL`

The ledger outlives the order. If an order is ever deleted, the historical stock
movement remains, so `stock_reconciliation()` still balances.

Note the asymmetry with `order_items`, which cascades from `orders`: items are
part of the order, whereas ledger entries are part of inventory history.

---

## Relationships that are NOT foreign keys

| Relationship | Why no FK |
|---|---|
| `audit_log.entity_id` → any table | Polymorphic by design. A real FK would need one column per audited table, and the log must survive the row it describes |
| `content_blocks.data` → product ids | The curated shelf ("Choix du Boss") stores ids inside `jsonb` (D-295). A deleted product simply stops rendering; the application filters unpublished ids at read time |
| `settings.value` → anything | Key/value store |

**Known consequence of the second row:** deleting a product leaves a dangling id
inside a `product_carousel` block. This is intentional — the alternative is a
join table for curation, which the CMS block already replaces. The storefront
query filters to published products, so a stale id is invisible rather than
broken. Worth a cleanup task in the dashboard later, not a schema change.

---

## Self-referencing tables

| Table | Column | Guard |
|---|---|---|
| `categories` | `parent_id` | Cycle detection trigger, max depth 10 |
| `menu_items` | `parent_id` | `ON DELETE CASCADE`; nesting is shallow by convention |

---

## Uniqueness that is easy to get wrong

| Table | Rule | Failure it prevents |
|---|---|---|
| `communes` | `(wilaya_id, name_fr)` and `(wilaya_id, name_ar)` | Homonym communes across wilayas are real; a global unique would reject valid seed rows |
| `product_variants` | `UNIQUE NULLS NOT DISTINCT (product_id, color_id, size_id)` | PostgreSQL treats NULLs as distinct, so a plain UNIQUE allows duplicate one-size variants |
| `delivery_prices` | `UNIQUE NULLS NOT DISTINCT (wilaya_id, commune_id, method_id)` | Two wilaya-level rows for one method would create ambiguous pricing |
| `product_media` | `UNIQUE (product_id) WHERE is_featured` | Two featured images, or none |
| `product_categories` | `UNIQUE (product_id) WHERE is_primary` | Ambiguous breadcrumb and canonical URL |
| `sheets_sync_queue` | `UNIQUE (order_id)` | Duplicate lines in the spreadsheet |
| `order_status_transitions` | `UNIQUE NULLS NOT DISTINCT (from, to)` | Duplicate transition rules |

---

## Cardinality summary by parent

| Parent | Children |
|---|---|
| `orders` | 4 — items, timeline, stock movements, sheets queue |
| `admin_users` | 9 — the actor on nearly every audited action |
| `products` | 3 — categories, media, variants |
| `wilayas` | 3 — communes, delivery prices, orders |
| `order_statuses` | 4 — orders, transitions (×2), timeline (×2) |
| `media` | 3 — product media, categories, pages |
