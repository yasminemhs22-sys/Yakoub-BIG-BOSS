# YAKOUB BIG BOSS — Project Specification

**Document status:** OFFICIAL SOURCE OF TRUTH
**Version:** 1.5
**Phase:** 0 — Specification Freeze
**Last updated:** 2026-08-01

> This document is authoritative. Any implementation that contradicts this
> document is a defect. Any change to this document requires explicit written
> approval from the Product Owner and a corresponding entry in `DECISIONS.md`.

---

## Table of Contents

1. [Project Identity](#1-project-identity)
2. [Brand](#2-brand)
3. [Business Model](#3-business-model)
4. [Scope](#4-scope)
5. [Technical Stack](#5-technical-stack)
6. [Internationalisation](#6-internationalisation)
7. [Geography & Delivery](#7-geography--delivery)
8. [Catalogue Model](#8-catalogue-model)
9. [Cart & Checkout](#9-cart--checkout)
10. [Order Lifecycle](#10-order-lifecycle)
11. [Inventory Rules](#11-inventory-rules)
12. [Administration & Roles](#12-administration--roles)
13. [CMS Requirements](#13-cms-requirements)
14. [Integrations](#14-integrations)
15. [Design System](#15-design-system)
16. [Information Architecture](#16-information-architecture)
17. [SEO Requirements](#17-seo-requirements)
18. [Performance Budget](#18-performance-budget)
19. [Security Requirements](#19-security-requirements)
20. [Accessibility](#20-accessibility)
21. [Asset Policy](#21-asset-policy)
22. [Legal & Compliance](#22-legal--compliance)
23. [Development Phases](#23-development-phases)
24. [Working Rules](#24-working-rules)
25. [Definition of Done](#25-definition-of-done)
26. [Out of Scope](#26-out-of-scope)
27. [Known Risks](#27-known-risks)
28. [Resolved Architecture Decisions](#28-resolved-architecture-decisions)
29. [Reference Data Source](#29-reference-data-source)
30. [Glossary](#30-glossary)
31. [Deliberately Deferred](#31-deliberately-deferred)

---

## 1. Project Identity

| Field | Value |
|---|---|
| Project | YAKOUB BIG BOSS — E-commerce Platform |
| Type | Production commercial website |
| Sector | Men's clothing retail |
| Market | Algeria only |
| Nature | **Not** a demo. **Not** a prototype. Real customers, real orders. |
| Priorities | Quality > correctness > maintainability > honesty > speed |

The platform must be built for scalability, security and long-term maintenance.

---

## 2. Brand

### 2.1 Official name

**`YAKOUB BIG BOSS`**

This exact spelling is used everywhere without exception: website, admin
dashboard, SEO metadata, Open Graph tags, Google Sheets, database seed data,
email templates, delivery slips, and documentation.

Variations observed in source assets — `YAKOUB-BIG-BOSS`, `Yakoub BiG BOOS` —
are **deprecated** and must never appear.

### 2.2 Business information

| Field | Value | Source |
|---|---|---|
| Business type | Men's clothing store / Magasin de vêtements | Facebook page |
| Location (FR) | Hlaimia, Boudouaou, Boumerdès | Facebook page |
| Location (AR) | حلايمية أمام مسجد حسان بن ثابت | Logo (official spelling) |
| Phone | 0563876210 | Logo + Facebook page |
| WhatsApp | 0563876210 | Facebook page |
| Instagram | `yakoub_big_boos` | Owner (official) |
| TikTok | `yakoub_big_boos` | Owner (official) |
| Facebook | Yakoub BiG BOOS (page exists) | Facebook page |
| Email | **Not yet defined** — CMS-editable field, added later | Owner |
| Opening hours | **Not yet defined** — CMS-editable, added later | Owner |

> **Rule:** All of the above are stored as CMS settings. None may be hardcoded.
> The phone number, address, social handles, email and opening hours must be
> changeable from the admin dashboard without a code change or redeploy.

### 2.3 Logo policy

- The existing logo is **kept as-is**. The brand identity must not be redesigned
  or replaced.
- Permitted technical improvements only: background transparency, resolution
  cleanup, favicon generation, PWA/app icon derivatives, and cropping for
  different placements.
- The logo raster contains a baked-in phone number and social handles. This is a
  known limitation (see §27). It is accepted and not to be corrected by
  redesigning the logo.

### 2.4 Product policy

The platform must **never** display or promote counterfeit or unauthorised
branded products.

The system must remain **completely generic** and product-agnostic:

- No brand-specific logic anywhere in the codebase.
- No third-party trademark names, monograms or logos in seed data, placeholder
  content, demo products, or Behance presentation material.
- The platform must work unchanged for any clothing catalogue.

---

## 3. Business Model

| Aspect | Rule |
|---|---|
| Payment | **Cash on delivery only.** No online payment. |
| Payment gateways | **None.** No Stripe, PayPal, Adyen, Mollie, or any other. |
| PCI scope | **None.** No card data is ever collected, transmitted or stored. |
| Order processing | Manual, by the administrator |
| Confirmation | By phone call to the customer |
| Customer accounts | **None.** Guest checkout only. |
| Currency | **DZD only.** No multi-currency. |
| Free shipping | **None.** Every order pays delivery. |

---

## 4. Scope

### 4.1 In scope (v1)

- Bilingual (FR / AR-RTL) public storefront
- Fully CMS-driven content
- Product catalogue with variants, sizes, colours, images
- Multi-product shopping cart
- Guest checkout with live delivery pricing
- Order management with status workflow and internal timeline
- Inventory with movement ledger
- Multi-admin dashboard with role-based permissions
- Google Sheets order sync
- Legal pages (CMS-editable)
- SEO with prerendering and social link previews
- Behance presentation package

### 4.2 Not built in V1

**Accommodated in V1 schema** (postponing would require altering tables holding
production data):

- Commune-level delivery pricing — nullable commune FK already present
- Product video media — `media_type` column already present
- Barcode support on variants — column reserved
- Additional admin roles — permissions already stored as data

**Deliberately deferred** (adding later is purely additive — see §31):

- Customer accounts and login
- Promo / discount codes
- WhatsApp and SMS notifications
- Delivery company API integrations (Yalidine, ZR Express, Noest)

---

## 5. Technical Stack

### 5.1 Approved

| Layer | Technology |
|---|---|
| UI library | React |
| Build tool | Vite |
| Styling | Tailwind CSS |
| Backend / DB / Auth / Storage | Supabase (PostgreSQL) |
| Hosting / Serverless | Netlify (incl. Functions and Edge Functions) |

### 5.2 Explicitly forbidden

Next.js · Shopify · WordPress · Firebase

### 5.3 SEO rendering strategy (approved)

Because Vite produces a client-rendered SPA and social crawlers (Facebook,
Instagram, TikTok, WhatsApp) do not execute JavaScript:

1. **Build-time prerendering** of the homepage, category pages, product pages and
   legal pages, in **both locales**.
2. **Netlify Edge Functions** injecting correct per-page meta and Open Graph tags
   for crawler requests.

This must be designed in from Phase 2, not retrofitted.

### 5.4 Server-side requirements

Any operation requiring a secret credential runs in **Netlify Functions**, never
in the browser:

- Google Sheets service-account authentication
- Future WhatsApp / SMS providers
- Any use of the Supabase `service_role` key

> **Absolute rule:** the Supabase `service_role` key must never be bundled into,
> referenced by, or reachable from client-side code.

### 5.5 Domain

No domain is registered yet. Development uses a temporary Netlify domain.

The canonical site URL must be read from a **single environment variable** used
by all canonical tags, `hreflang` tags, sitemap entries, Open Graph URLs, and
structured data — so that switching to the production domain is a configuration
change only.

---

## 6. Internationalisation

### 6.1 Languages

- **French (FR)** — LTR
- **Arabic (AR)** — RTL

Both are first-class. Every CMS-editable field exists in both languages.
No UI string may be hardcoded in either language.

### 6.2 Language switching

- Switching is **instant**, with no full page reload.
- Switching **preserves the current page** — it must never redirect to the
  homepage.

### 6.3 URL strategy

Locale-prefixed routes: `/fr/...` and `/ar/...`

- Each locale tree is separately indexable.
- `hreflang` tags link the two.
- One canonical URL per locale.

### 6.4 First visit & persistence

1. Detect browser language.
2. Arabic → open Arabic. Otherwise → open French.
3. Persist the user's explicit choice locally.
4. On subsequent visits, the persisted choice wins over detection.

Implementation must avoid a visible flash of the wrong language/direction before
first paint.

### 6.5 Fallback rule

If Arabic content is missing, display the French content.

- **Silent on the storefront.** The customer sees no marker, no notice, no
  indication whatsoever. A section must never render empty.
- **Loud in the dashboard.** Missing translations are clearly flagged per record,
  with a filterable "needs translation" view.

### 6.6 Numerals

**Western digits everywhere, in both locales.**

- French: `1500 DZD`
- Arabic: `1500 د.ج`
- Eastern Arabic numerals (`١٥٠٠`) must never be rendered.

### 6.7 RTL requirements

RTL is a full layout mirror, not a text-direction flip:

- CSS logical properties throughout (`margin-inline-start`, not `margin-left`)
- Mirrored directional icons (arrows, chevrons, progress)
- Correct bidirectional handling of Latin text (product names, SKUs) inside
  Arabic sentences
- Separate type scales per script (Arabic needs larger size and line-height at
  equivalent optical weight)

---

## 7. Geography & Delivery

### 7.1 Coverage

Algeria only. **The historical 58-wilaya model**, with all 1,541 communes.

**RESOLVED (C-01).** Algeria officially moved to 69 wilayas under Law n° 26-06
(Journal Officiel, 4 April 2026), with transition running to 31 December 2026.
**This project deliberately does not adopt the 69-wilaya reform.** The delivery
system, pricing, checkout, database and admin dashboard are all based on the
58-wilaya model, because that is what Algerian delivery companies currently
operate on.

Accepted consequence: a customer in a newly created wilaya (e.g. Bou Saâda) will
select its historical parent (M\'Sila). This is correct for dispatch and pricing.

Wilayas carry an official `code` (1–58) matching delivery-company conventions.
Wilayas and communes are seeded reference data in the database.

### 7.1.1 Identity and uniqueness rules

**Store the wilaya `code`, never the wilaya name.** Names vary in spelling and
transliteration between sources and couriers; the numeric code does not. Every
reference — orders, delivery pricing, courier field-matching — keys on the code.

**Commune uniqueness is scoped to `(wilaya_id, name)`, never global.** Homonym
communes exist in different wilayas. A global unique constraint would reject
valid rows during seeding, and the failure would look like a corrupt dataset
rather than a schema error.

### 7.2 Delivery methods

| Code | FR | AR |
|---|---|---|
| `bureau` | Bureau | مكتب |
| `domicile` | À domicile | إلى المنزل |

Delivery methods are stored as data, not a code enum, to allow future additions.

### 7.3 Pricing

- Price is set **per wilaya**, with **two values**: bureau price and home price.
- Both are managed entirely by the administrator.
- **No free shipping.** No thresholds.
- All 58 wilayas must have prices before launch.

### 7.4 Future commune pricing

The delivery pricing table must carry a **nullable commune reference** from day
one, so commune-level overrides can be enabled later with no schema redesign.

Resolution order (when enabled): commune override → wilaya price.

### 7.5 Delivery company (per order)

Each order carries an editable shipping block:

| Field | Notes |
|---|---|
| Delivery company | Yalidine / ZR Express / Noest / Custom — stored as data, extensible |
| Tracking number | Free text |
| Shipping date | Date |
| Estimated delivery date | Date |

All fields editable by the administrator at any time.
Delivery-company **API integrations** are out of scope for v1.

---

## 8. Catalogue Model

### 8.1 Categories

- Fully admin-managed. **No hardcoded categories.**
- Hierarchical tree (minimum two levels, schema must permit three).
- Bilingual name, description, slug, image, sort order, visibility.

### 8.2 Sizes

- **Created by the administrator.** No hardcoded size lists.
- Each product may use a completely different sizing system
  (e.g. `S M L XL XXL`, `38 39 40 41 42`, `One Size`).
- Each size carries: bilingual label, `sort_order`, and a `size_group`
  (alpha / numeric / one-size) so ordering is correct automatically.

### 8.3 Colours

- **Created by the administrator.** No hardcoded colour lists.
- Each colour carries: bilingual name and a hex value (for swatch rendering).
- Each product selects its own colours.

### 8.4 Variants

A variant is the sellable unit. Stock lives on the variant, **never** on the
product.

| Field | Rule |
|---|---|
| Colour | **Nullable** foreign key |
| Size | **Nullable** foreign key |
| Stock quantity | Integer, derived from the movement ledger |
| SKU | Auto-generated, **manually editable** |
| Price adjustment | Optional, signed |
| Image | Optional, links to a product image |
| Barcode | Field reserved for future use |

Nullable colour and size mean a `One Size` product in three colours is three
normal variants with `size_id = NULL` — no special-case logic. A third axis
(material, fit) can be added later without restructuring.

### 8.5 Prices

Every product supports:

| Field | Rule |
|---|---|
| **Original price** | Required |
| **Sale price** | Optional |

Display logic:

- Sale price present → show sale price as the active price, with the original
  price struck through.
- Sale price absent → show only the original price. No strike-through, no
  "discount" affordance.
- Sale price must be validated as lower than the original price.
- The **active price** (sale if present, else original) is what feeds the cart,
  the order total, and the order snapshot.
- Variant price adjustment (§8.4) applies on top of the active price.

All prices are dynamic and come from the database. No predefined ranges, no
hardcoded values anywhere.

### 8.6 Product media

- **Unlimited images** per product.
- **Drag-and-drop ordering** in the dashboard (persisted `sort_order`).
- **Exactly one featured image** per product.
- **Video support reserved** — the media table carries a `media_type` from day
  one so video can be added without migration.
- Bilingual alt text.

---

## 9. Cart & Checkout

### 9.1 Cart

- Customers may order **multiple products in a single order**.
- Cart persists locally across sessions (no account required).
- Line items reference **variants**, not products.

### 9.2 Checkout fields

| Field | Required |
|---|---|
| First name | Yes |
| Last name | Yes |
| Phone number | Yes |
| Wilaya | Yes |
| Commune | Yes |
| Delivery method (Bureau / À domicile) | Yes |
| Street address | **Required** for `domicile`. **Optional** for `bureau`. |
| Order notes | Optional |

Address requirement is enforced conditionally: the field becomes mandatory the
moment `domicile` is selected, and the validation message must be clear in both
locales.

No other fields may be added without approval. Every field must earn its place —
the order form is the entire revenue path.

### 9.3 Live pricing

- Delivery price updates **instantly** when wilaya or delivery method changes.
- The final total updates **automatically**.
- The total must remain visible throughout checkout.

### 9.4 Validation & anti-fraud

Because there is no payment step, there is no natural fraud filter. Required:

- Algerian phone-format validation with clear inline errors
- Rate limiting per IP and per phone number
- Duplicate-order detection
- Honeypot field
- Phone blocklist, fed by orders marked `fake`

### 9.5 Confirmation

- Order confirmation screen displays a **reference number** the customer can
  screenshot.
- A WhatsApp contact link is offered.
- Order tracking by **phone + reference number**, with no account.

### 9.6 Data snapshotting

At order submission, the order **snapshots**:

- Product name (FR and AR)
- Variant details (colour, size, SKU)
- Unit price
- Delivery fee
- Totals

Later edits to catalogue prices or names must **never** retroactively change a
historical order.

---

## 10. Order Lifecycle

### 10.1 Statuses

Statuses are stored in a **database table**, not a code enum, so new statuses are
a data change.

| Status | Meaning |
|---|---|
| `new` | Submitted, untouched |
| `pending_confirmation` | Admin is attempting contact |
| `unreachable` | No answer — attempt counter + next-retry date |
| `confirmed` | Confirmed by phone → **stock decrements here** |
| `preparing` | Being packed |
| `ready_to_ship` | Awaiting pickup by delivery company |
| `shipped` | Handed over, tracking recorded |
| `delivered` | Received by customer |
| `cash_collected` | Money received from the delivery company |
| `returned` | Refused or undeliverable → **stock restored** |
| `cancelled` | Cancelled by customer or admin |
| `fake` | Fraudulent → feeds the phone blocklist |

`delivered` and `cash_collected` are deliberately separate: in Algerian COD the
delivery company remits payment days or weeks after delivery, and merging them
would misrepresent the real cash position.

`returned` and `fake` are deliberately separate: returns are normal business,
fake orders are a fraud signal.

### 10.2 Order timeline

Every order carries an internal history/timeline. Every action records:

- **Administrator** (who)
- **Date**
- **Time**
- **Optional note**

Example entries: called customer · no answer · confirmed · prepared · shipped ·
delivered · cancelled · returned · fake order.

The timeline is append-only and must never be editable or deletable.

---

## 11. Inventory Rules

### 11.1 Core rule

> Stock decreases **only** when the administrator confirms the order.
> Submitting an order **never** reserves stock.

Rationale: cash-on-delivery stores receive a significant volume of fake orders.
Reserving stock on submission lets bad actors deplete inventory at zero cost.

### 11.2 Movement ledger

Stock is a **ledger**, not a bare integer column. A `stock_movements` table
records every change with type, quantity, actor, reason and timestamp:

| Movement | Effect |
|---|---|
| Order confirmed | Decrease |
| Order returned | Increase |
| Order cancelled after confirmation | Increase |
| Manual correction | Either |
| Restock | Increase |

This gives a full audit trail and answers "why is this size gone?".

### 11.3 Storefront display

- Show `In stock` / `Only N left` / `Out of stock`.
- Do **not** display exact quantities above a configurable threshold.
- Out-of-stock variants are **disabled and visible**, never hidden — customers
  must understand the size exists.

---

## 12. Administration & Roles

### 12.1 Authentication

Supabase Auth, for **staff only**. The storefront is entirely anonymous.

### 12.2 Roles (minimum)

| Role | Scope |
|---|---|
| Super Admin | Everything, including managing admins and roles |
| Administrator | Orders, catalogue, inventory, delivery pricing |
| Content Manager | CMS content, media, translations |

### 12.3 Permissions model

Permissions are **data**, not code. A `role_permissions` table maps roles to
granular permissions. Adding a role is a database row, never a deployment.

No `if (role === 'admin')` checks scattered through the codebase.

### 12.4 Dashboard requirements

- **Action-oriented home:** orders awaiting confirmation, today's revenue,
  low-stock alerts, unreachable orders due for retry. Not vanity charts.
- **Order workspace built for phone work:** tap-to-call, timeline, note field,
  status buttons — and it **must work well on a mobile screen**, because the
  administrator will often be on a phone.
- **Unreachable retry queue** with attempt counter and next-call date.
- **Bulk actions:** confirm, print delivery slips, export.
- **Translation completeness badges** and a "needs translation" filter.
- **Live preview** of content blocks before publishing.
- **Media library** with reuse (no repeated uploads).
- **Variant matrix editor** — a colour × size grid for bulk stock entry, not one
  form per variant.
- **Stock movement log** per variant.
- **Audit log** of every admin write, filterable by user.
- **Fake-order blocklist** with automatic flagging of repeat offenders.
- **Google Sheets sync status panel** with manual re-sync.
- **Delivery price editor** — single 58-row table, inline editing, bulk update.
- **Roles screen** driven by the permissions table.

### 12.5 Audit log

Every administrative write is logged: actor, action, entity, before/after,
timestamp. Required because multiple admins process real money manually.

---

## 13. CMS Requirements

### 13.1 Core principle

> The entire website is CMS-driven. Everything visible is editable from the admin
> dashboard without touching code. **Nothing is hardcoded except application
> business logic.**

### 13.2 Editable surfaces

- All page content and section blocks
- Navigation menus
- Announcement bar
- Hero content and imagery
- Categories, products, variants, media
- Delivery prices
- Business info: phone, email, address, opening hours, social links
- SEO metadata (title, description, OG image) **per page, per language**
- Legal pages
- All UI microcopy

### 13.3 Structured content, not raw HTML

Content is authored as **typed, validated blocks** (hero, product grid, text
section, banner, trust strip…), each with FR and AR fields.

A free-form raw-HTML box is **forbidden**: it lets the administrator break the
layout and would allow stored XSS on the brand's own site.

### 13.4 Block behaviour

Homepage and page blocks must be reorderable and individually toggleable from the
dashboard.

### 13.5 Content entry ergonomics

The Product Owner will author all FR and AR content later through the dashboard.
Content entry speed is therefore a **design requirement**, not an afterthought:

- Side-by-side FR / AR fields
- Keyboard-driven forms
- Bulk editing where sensible
- Translation-completeness badges
- "Needs translation" filter
- No placeholder or lorem text ever shipped to production

### 13.6 Legal pages

CMS-editable pages, created in v1 with content supplied later:

- Privacy Policy
- Return Policy
- Terms & Conditions

---

## 14. Integrations

### 14.1 Google Sheets — mandatory

**Requirement:** every **confirmed** order automatically appears in Google
Sheets.

| Aspect | Decision |
|---|---|
| Structure | **A single sheet containing all orders.** No monthly tabs. |
| Filtering | The administrator uses spreadsheet filters. |
| Trigger | Order confirmation |
| Direction | **One-way** (database → Sheets). Sheets is a reporting mirror, **not** a source of truth. Edits in Sheets do not flow back. |
| Auth | Google service account, credentials in Netlify environment variables |
| Owner's only task | Paste the service-account JSON and share the sheet with that account's email |

**Reliability design:** confirmation writes to a `sync_queue` table; a worker
pushes to Sheets and marks success or failure with a retry count. If Sheets is
unreachable or the token expires, nothing is lost and the admin's confirmation is
never blocked. A manual re-sync control is provided.

### 14.2 Customer communication

**Phone calls are the only supported communication method in V1.**

Every call, attempt and outcome is already recorded in the order timeline
(§10.2), with administrator, date, time and optional note.

**No notifications outbox table exists in V1 — deliberately.** See §31.

---

## 15. Design System

### 15.1 Direction

**"Neon Street" — dark, high-contrast, bold.**

Derived directly from the brand's own storefront sign: dark surfaces, product
photography as the bright element, one hot accent for actions, heavy condensed
display type.

Explicitly avoided: pastel minimalism, luxury-boutique whitespace, generic
template aesthetics.

### 15.2 Colour palette

| Role | Hex | Source |
|---|---|---|
| Base | `#0A0A0A` | Logo background |
| Surface | `#151515` | Elevated cards |
| Surface alt | `#1F1F1F` | Inputs, borders |
| Primary accent | `#FF6A00` | Sign letter edges |
| Deep accent | `#8B1A1A` | Sign backing board |
| Signal red | `#E23B2E` | Logo phone icons |
| Highlight | `#FFE600` | Arabic line in logo |
| Text primary | `#FFFFFF` | Wordmark |
| Text secondary | `#A8A8A8` | — |
| Metal | `#C9CDD2` | Sign letter faces |
| Success | `#22C55E` | Added — no brand equivalent existed |

**Usage discipline:**

- Orange — primary actions only (Order, Add to cart)
- Yellow — badges and promotions
- Red — errors and out-of-stock
- Maroon — gradient partner with black in hero sections
- Green — confirmations

All pairings must be verified against WCAG AA contrast.

### 15.3 Typography

| Use | Latin | Arabic |
|---|---|---|
| Display / headings | Anton or Archivo Black | Cairo ExtraBold |
| Body / UI | Inter | IBM Plex Sans Arabic or Tajawal |

- Fonts are **self-hosted locally**. No Google Fonts CDN.
- Subset and preloaded; the Arabic subset loads only in Arabic.
- Separate type scales per locale.

### 15.4 Tokens

A real token layer (colour, spacing, radius, typography, motion) so nothing
drifts. Motion is restrained: 150–250ms transitions, with a subtle neon glow on
primary buttons echoing the storefront sign.

---

## 16. Information Architecture

### 16.1 Homepage blocks

All CMS-managed, reorderable, individually toggleable:

1. Announcement bar (dismissible)
2. Header — logo, nav, language switch, search, cart
3. Hero — full-bleed image, headline, subheadline, CTA
4. Category strip — horizontally scrollable on mobile
5. New arrivals
6. Featured / promotional banner
7. Curated shelf ("Choix du Boss") — manual curation, not algorithmic
8. Trust strip — delivery across 58 wilayas · cash on delivery · verified
   quality · WhatsApp support
9. Store presence — storefront photo, bilingual address, map link, phone and
   WhatsApp buttons
10. Social proof
11. Footer — categories, policies, contact, social, language switch

### 16.2 Navigation

- **Mobile header:** hamburger · logo · search · cart, with a visible `FR / ع`
  toggle (not buried in a menu)
- **Drawer:** Home · Shop (expandable categories) · New arrivals · Promotions ·
  Track my order · Contact · Language toggle · WhatsApp pinned at the bottom
- **Sticky bottom bar (mobile):** Home · Categories · Search · Cart · WhatsApp
- Categories come from the database tree, never hardcoded

### 16.3 Product page

1. Breadcrumb
2. Image gallery — swipeable, thumbnails, pinch-zoom, featured first, video slot
   reserved
3. Name, category, SKU
4. Price, with struck-through original when a promotion is active
5. Colour selector — visual swatches from the admin-defined hex, not a dropdown
6. Size selector — buttons; unavailable combinations visibly disabled
7. Stock indicator
8. Quantity + primary CTA (orange), plus a secondary **"Order via WhatsApp"**
   that pre-fills product name and SKU
9. **Delivery estimator** — select wilaya, see bureau and home price immediately,
   before checkout
10. Description, size guide, care info — collapsible, bilingual
11. Related products
12. Sticky mobile bottom bar with price and order button

---

## 17. SEO Requirements

- Separate indexable `/fr/` and `/ar/` trees with `hreflang` and per-locale
  canonicals
- Prerendered product and category pages (see §5.3)
- CMS-editable meta title, description and OG image **per page, per language**
- Product structured data (JSON-LD) with DZD price and availability
- LocalBusiness / Store schema using the real address, phone and coordinates
- Auto-generated per-locale sitemap and `robots.txt`
- Slugs derived from the product name, editable; Arabic slugs **transliterated**,
  not percent-encoded
- Open Graph and Twitter cards tuned for link previews — most traffic arrives
  from social shares, so the preview card is the first impression
- Image alt text from bilingual product names

---

## 18. Performance Budget

**Target device: mid-range Android on 3G.** That is the real audience.

| Metric | Budget |
|---|---|
| LCP (4G) | < 2.5s |
| Storefront JS (gzipped) | < 200KB |

Requirements:

- Local image optimisation: AVIF/WebP, responsive sizes, blur placeholders, lazy
  loading below the fold
- Self-hosted subset fonts, preloaded, `font-display: swap`
- Route-level code splitting; **the admin bundle is never shipped to storefront
  visitors**
- Edge caching on catalogue pages
- Supabase queries select explicit columns — never `select *`
- Indexes on slug, category, status, phone, variant lookup
- Cursor-based pagination, never offset
- Skeleton loaders, not spinners
- Supabase Storage behind a CDN, strict upload size limits, server-side resizing

Traffic will be **spiky, not steady** (social/reel-driven). Aggressive caching is
required from day one.

---

## 19. Security Requirements

### 19.1 Row Level Security

RLS is the primary security model and is reviewed as a first-class deliverable.

| Data | Policy |
|---|---|
| Published content | Public read |
| Orders | **No public read.** Ever. |
| Customers' personal data | **No public read.** Ever. |
| Admin tables | Authenticated + permission-checked |

Orders contain names, phone numbers and addresses. A single permissive policy
would expose the entire customer database. Every policy must be explicitly tested
with an anonymous key before launch.

### 19.2 Key handling

- `service_role` key: server-side only, never in the browser
- `anon` key: client-side, with RLS assumed hostile
- All secrets in environment variables, never committed

### 19.3 Application security

- Input validation on both client and server
- Rate limiting on order submission and tracking lookup
- No raw HTML authoring (see §13.3)
- Audit logging of all admin writes
- Backups: retention and restore procedure decided **before** real orders exist

---

## 20. Accessibility

- WCAG AA contrast on all colour pairings
- Full keyboard navigation
- Visible focus states
- Semantic HTML and correct ARIA
- Correct `lang` and `dir` attributes per locale
- Accessible form labels and error messaging in both languages
- Respect `prefers-reduced-motion`

---

## 21. Asset Policy

> **All project assets must remain local.**

- No Unsplash. No external image services. No hotlinking.
- No external font CDNs.
- Only the Product Owner's supplied brand assets, plus generated non-branded
  placeholders.
- The project must be self-contained enough that real Behance presentation images
  can be generated from the finished site at the end.

### 21.1 Behance package (final phase)

- Real screenshots from the finished website
- Both FR and AR screens
- Case-study screens and mockups
- Written case study
- Local assets only, no counterfeit branding in any frame

---

## 22. Legal & Compliance

- Privacy Policy, Return Policy, Terms & Conditions — built as CMS pages,
  content supplied by the Product Owner before launch
- No counterfeit or unauthorised branded products (§2.4)
- Algerian consumer-protection and distance-selling obligations should be
  reviewed by a qualified professional in-jurisdiction. This specification does
  not constitute legal advice.

---

## 23. Development Phases

One phase at a time. No phase begins without explicit written approval.

| # | Phase | Deliverable |
|---|---|---|
| **0** | Specification freeze | This document + `DECISIONS.md` |
| 1 | Database schema | Tables, relations, RLS policies, seed data (58 wilayas + communes) |
| 2 | Foundation | Vite, Tailwind, tokens, i18n, RTL, routing, CI |
| 3 | Admin auth | Supabase Auth, roles, permissions, guards |
| 4 | CMS layer | Content blocks, settings, media library |
| 5 | Catalogue | Products, variants, sizes, colours, images |
| 6 | Storefront | Home, categories, product pages |
| 7 | Cart & checkout | Cart, delivery pricing, order submission |
| 8 | Order management | Statuses, timeline, stock movements |
| 9 | Google Sheets | Netlify Functions, queue, retry, sync panel |
| 10 | SEO & performance | Prerendering, meta, sitemaps, optimisation |
| 11 | Hardening | RLS audit, anti-fraud, accessibility, backups |
| 12 | Launch & Behance | Deploy, runbooks, presentation package |

---

## 24. Working Rules

Mandatory for every phase:

1. Work on **one phase only**.
2. Never continue to the next phase without explicit approval.
3. Perform a **complete self-review** at the end of every phase.
4. Be completely honest in review. Fix mistakes, weaknesses and bad design
   **before** presenting the phase.
5. If something is uncertain, **ask** — never assume.
6. Every phase closes with: what was implemented · files created/modified ·
   database changes · security review · performance review · UX review ·
   limitations and future improvements.
7. **Never claim something works unless it was verified.** Where verification is
   impossible in the development environment, say so explicitly and state exactly
   what the Product Owner must test.
8. If a better architecture is discovered mid-phase, **stop and explain** before
   changing the plan.
9. Wait for approval before starting the next phase.
10. Re-read the specification during development rather than trusting memory.
11. Continuously compare implementation against specification.
12. If context limits make any prior decision uncertain, **stop and ask**.
    One question is better than one wrong assumption.

---

## 25. Definition of Done

A phase is done only when **all** of the following hold:

- [ ] Every specification requirement in scope for the phase is implemented
- [ ] Self-review completed and findings fixed
- [ ] Security reviewed (RLS, keys, validation, authorisation)
- [ ] Performance reviewed against §18
- [ ] UX reviewed, including RTL and mobile
- [ ] Both locales handled, with fallback behaviour correct
- [ ] No hardcoded content that should be CMS-driven
- [ ] No external assets introduced
- [ ] Limitations documented honestly
- [ ] Unverified claims explicitly labelled as unverified
- [ ] `DECISIONS.md` updated with any new decisions

---

## 26. Out of Scope

Online payments · payment gateways · PCI compliance · customer accounts ·
multi-currency · international shipping · delivery-company API integrations ·
two-way Google Sheets sync · promo codes (v1) · WhatsApp/SMS sending (v1) ·
mobile applications · marketplace or multi-vendor features

---

## 27. Known Risks

| Risk | Severity | Mitigation |
|---|---|---|
| **Fake orders** — no payment means no fraud filter | High | Confirmation-time stock decrement, phone validation, rate limiting, duplicate detection, honeypot, blocklist |
| **RLS misconfiguration** exposing customer PII | Critical | Explicit policy review, anonymous-key testing before launch, Phase 11 audit |
| **Arabic RTL underestimated** — fonts, mirroring, bidi | Medium | Logical properties, per-locale type scales, RTL in every UX review |
| **Bilingual content burden** — half-empty Arabic pages | Medium | Silent FR fallback + dashboard completeness indicators |
| **High COD return rates** (typically 15–30% in apparel) | Medium | Return status restores stock; reporting from day one |
| **Spiky viral traffic** from reels | Medium | Aggressive caching, prerendering, edge delivery |
| **Single phone number** is the entire support capacity | Medium | Unreachable retry queue, WhatsApp path, bulk actions |
| **Logo is low-resolution raster with baked-in contact details** | Low | Accepted by owner; technical cleanup only, no redesign |
| **Banner is a low-light night photo** with distracting elements | Low | Heavy crop + gradient darkening for hero use |
| **Poor product photography** would undermine the dark UI | Medium | Defined aspect ratio and treatment; process discipline required from owner |
| **Vite SPA is weak for SEO and social previews** | High | Prerendering + Edge Functions (§5.3) |
| **Netlify/Supabase free-tier limits** under viral load | Medium | Monitor; plan upgrade path before launch |
| **Supabase backup retention** on lower tiers | Medium | Decide backup/restore procedure before real orders |

---

## 28. Resolved Architecture Decisions

All contradictions found in the pre-Phase-1 re-read are resolved below. Each
records the chosen approach and the reasoning.

### C-01 — Wilaya model ✅ RESOLVED

**58-wilaya model.** See §7.1. The 69-wilaya reform is explicitly excluded.

### C-02 — Prerendering freshness ✅ RESOLVED

**Approach:** three layers.

1. Build-time prerendering produces static HTML for crawlers and first paint.
2. The SPA **hydrates with live Supabase data**, so human visitors always see
   current content regardless of build age.
3. Publishing a CMS change fires a **Netlify Build Hook**, debounced (one build
   per N minutes) so a burst of edits triggers one rebuild, not twenty.

**Why this is safest:** humans are never stale, crawlers are never blank, and the
build budget is protected. The alternative — rebuilding on every keystroke —
would exhaust Netlify build minutes and make the dashboard feel slow.

**Rebuild status is visible in the dashboard**, with a manual "rebuild now"
control, so the administrator is never guessing.

### C-03 — Variant uniqueness with nullable colour and size ✅ RESOLVED

**Approach:** `UNIQUE NULLS NOT DISTINCT (product_id, color_id, size_id)`.

PostgreSQL 15 added `NULLS NOT DISTINCT`, which treats two NULLs as equal for
uniqueness purposes — exactly the semantics needed.

**Why this over the alternatives:**

| Option | Verdict |
|---|---|
| `COALESCE` sentinel UUIDs in an expression index | Works, but introduces magic constants that leak into queries and confuse future maintainers |
| Sentinel "No colour" / "No size" rows | Pollutes admin dropdowns with fake options; every listing needs a filter |
| **`NULLS NOT DISTINCT`** | **Declarative, readable, zero magic values, enforced by the database** |

**Baseline: PostgreSQL 15+.** Current Supabase projects run PG 15 or later, so
the schema is designed against it. This is a baseline, not an immutable
assumption, and it does **not** block development.

**Fallback Strategy.** If the live project turns out to run PostgreSQL 14 or
earlier, swap the single constraint for a `COALESCE` expression index:

```sql
-- PG 15+ (default)
CONSTRAINT product_variants_combo_key
  UNIQUE NULLS NOT DISTINCT (product_id, color_id, size_id)

-- PG 14 fallback — replaces the constraint above, nothing else changes
CREATE UNIQUE INDEX product_variants_combo_key ON product_variants (
  product_id,
  COALESCE(color_id, '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(size_id,  '00000000-0000-0000-0000-000000000000'::uuid)
);
```

The fallback is **isolated to one migration file**. No table structure, column,
query or application code changes. Version is confirmed when the Supabase
project exists; until then this is recorded as **Not Verified**.

### C-04 — Overselling at confirmation ✅ RESOLVED

**Approach:** confirmation is a single PostgreSQL function (RPC), not a sequence
of client calls. Inside one transaction:

1. `SELECT ... FOR UPDATE` on every variant in the order — takes row locks
2. Verify available stock for each line
3. **Insufficient stock → abort**, returning a structured error naming the short
   lines
4. Sufficient → write `stock_movements`, update status, append the timeline
   entry, enqueue the Google Sheets sync
5. Commit atomically

**Override:** roles with the `orders.oversell` permission may pass an explicit
flag, which requires a mandatory note and is recorded in the timeline and audit
log. **Default behaviour is a hard block.**

**Why this is safest:** the guarantee lives in the database, not the application.
Two admins clicking confirm at the same moment cannot both succeed, because the
second waits on the row lock and then fails the stock check. Nothing can be
half-confirmed — either the whole order commits or none of it does.

This also resolves **C-07g** (admin concurrency): the same lock serialises
competing writers, and the RPC additionally validates that the requested status
transition is legal from the current status.

### C-05 — Silent fallback vs `hreflang` ✅ RESOLVED

**Approach:** separate what the customer sees from what the crawler is told.

- **Storefront:** unchanged. Silent French fallback, always. (D-093, D-094)
- **Sitemap and `hreflang`:** a record's Arabic URL is included **only when its
  essential Arabic fields are present** (name, description, meta). Otherwise the
  page emits French-only `hreflang` and is omitted from the Arabic sitemap.

**Why this is safest:** it tells search engines the truth without degrading the
customer experience, requires no administrator effort, and **self-heals** — the
moment a translation is filled in, the page enters the Arabic sitemap on the next
build. `noindex` was rejected as too blunt: it would suppress pages that are
genuinely useful to Arabic-speaking visitors arriving from social links.

### C-06 — 1,541 communes vs the JS budget ✅ RESOLVED

**Approach:** communes are **never bundled**.

- The 58 wilayas (small) ship with the build.
- Selecting a wilaya fetches only that wilaya's communes (~27 rows average) with
  explicit column selection, served over a cached endpoint.
- Results are memoised per session, so re-selecting is instant and free.
- Index on `communes(wilaya_id)`; the searchable combobox filters within the
  loaded subset.

**Why:** payload per interaction drops from roughly 200KB to 1–2KB, which is the
difference between a usable and an unusable checkout on 3G. This is the standard
dependent-dropdown pattern and it keeps §18's budget intact.

### C-07a — Phone number canonical format ✅ RESOLVED

Two columns: `phone_raw` (exactly as typed) and `phone_e164` (normalised
`+213XXXXXXXXX`).

Normalisation strips spaces, dots and dashes, and accepts `0…`, `+213…` and
`00213…`. Algerian mobile prefixes are validated. All matching — blocklist,
duplicate detection, order tracking — uses `phone_e164`; display uses the local
format.

**Why:** one canonical form makes fraud detection reliable, while the raw input
is preserved for audit and for reading back to the customer.

### C-07b — Order reference format ✅ RESOLVED

`YBB-YYMMDD-XXXX`, where `XXXX` is Crockford base32 (no ambiguous characters),
generated server-side with a unique constraint and collision retry.

**Why not sequential:** sequential references leak order volume to competitors
and invite enumeration on the tracking page. The date segment keeps it readable
for the administrator; the random segment keeps it unguessable. Tracking still
requires phone **and** reference (D-059), so this is defence in depth.

### C-07c — SKU uniqueness ✅ RESOLVED

Auto-generated as `PRODUCT-COLOUR-SIZE` (uppercase, transliterated). A **global
unique constraint** on `variants.sku`. Manual edits are allowed; a collision
returns a clear, localised error. A `sku_is_custom` flag ensures regeneration
(e.g. after a product rename) never overwrites a manually chosen SKU.

**Why:** the database guarantees uniqueness, and administrator intent is never
silently discarded.

### C-07d — Featured image deletion ✅ RESOLVED

A partial unique index — `UNIQUE (product_id) WHERE is_featured` — guarantees at
most one featured image. Deleting the featured image fires a trigger that
promotes the next image by `sort_order`. A product with no images cannot be
published.

**Why:** "exactly one featured image" becomes a database invariant rather than a
rule the UI hopes to enforce.

### C-07e — Cart revalidation ✅ RESOLVED

The cart stores **only** `variant_id` and quantity. **Never prices.**

On cart view and again at submission, the server revalidates: variant exists,
product published, stock available, current active price. Changes are surfaced
with a clear notice requiring acknowledgement; removed variants are dropped with
an explanation.

**Why this matters more than it looks:** because the client never sends prices,
a tampered request cannot change what an order costs. The order total is computed
server-side from the database every time. This is the single most important
integrity rule in the checkout.

### C-07f — Order edit repricing ✅ RESOLVED

- **Line-item snapshots are immutable.** Changing the catalogue never alters a
  placed order.
- **Delivery fee is recalculated** if the administrator changes the wilaya or
  delivery method, with old and new values written to the timeline alongside the
  administrator's identity.
- A **manual delivery fee override** field exists, since real negotiations happen
  by phone.

**Why:** historical accuracy is preserved where it matters (what the customer
agreed to buy) while allowing the corrections that manual COD operations
genuinely require — all of it audited.

### C-07g — Admin concurrency ✅ RESOLVED

Covered by C-04: row-level locking inside the confirmation RPC, plus validated
status transitions.

### C-08 — Commune dataset ✅ RESOLVED (source approved pending spot-check)

See §29.

---

## 29. Reference Data Source

**Status: RECOMMENDED — awaiting Product Owner approval. Nothing imported yet.**

### 29.1 Candidates evaluated

| Source | Communes | FR+AR | Adoption | Last activity | Courier-aware |
|---|---|---|---|---|---|
| **othmanus/algeria-cities** | 1,541 | Yes (3 variants) | 634★ / 296 forks | v3.0.0, Apr 2021 | No |
| **DZBuild-com/dzship** (`data/`) | 1,541 | Yes | 5★ / 1 fork | Active, 2026 | **Yes** |
| lamaridev/Algeria-wilaya-cities | Per-wilaya JSON | Yes | Minimal | Unknown | No |
| kossa/algerian-cities | Via Laravel pkg | Yes | Moderate | Active | No |
| Yalidine API (live) | ~1,400 served | FR primary | N/A | Live | Authoritative |

### 29.2 Recommendation

**Primary seed: `othmanus/algeria-cities`, cross-validated against
`DZBuild-com/dzship`.**

Neither dataset is trusted alone. Both are imported, **diffed commune by
commune**, and every disagreement is written to a review list for the Product
Owner. This is materially stronger than accepting either source on faith, and it
costs one script.

**Why othmanus is primary**

- **Completeness:** 58 wilayas, 546 dairas, 1,541 communes, 3,940 post codes.
  Post codes are a genuine bonus for address quality.
- **Accuracy through adoption:** 634 stars and 296 forks means years of real
  projects surfacing errors through issues and PRs. Twelve open issues is a sign
  of scrutiny, not neglect.
- **Apparent staleness is not a real problem.** The last release is April 2021,
  but the 58-wilaya division dates from Law 19-12 of December 2019 and communes
  have not changed since. The dataset postdates the division it describes.
- **Format variety** (CSV, JSON, SQL, XLSX) makes import and future re-validation
  trivial.
- **Three language variants** — Arabic only, ASCII/French only, and combined —
  map cleanly onto the bilingual schema.

**Why dzship is the cross-check rather than the primary**

It is explicitly courier-oriented and current, and its field notes on commune
matching are the most useful documentation found. But it has **5 stars and 1
fork**: essentially unvetted by the community. For production data where a wrong
name means an undeliverable parcel, adoption is a real accuracy signal, and
dzship does not yet have it. Its value here is as an independent second opinion.

### 29.3 Rejected

| Source | Reason |
|---|---|
| lamaridev/Algeria-wilaya-cities | Minimal adoption, no stated provenance, per-wilaya file structure adds import friction for no benefit |
| kossa/algerian-cities | Laravel-coupled; its stated upstream is a **wilaya-level** repository, which leaves commune provenance unclear. Its postal codes and coordinates are useful, but othmanus already supplies post codes |
| Yalidine API (as primary) | Authoritative for delivery, but requires credentials, is per-courier, covers ~1,400 of 1,541 communes, and cannot be a local seed file without runtime fetching (violates D-210). Correct role: alias source once courier integration begins |

### 29.4 Required before import

Product Owner spot-checks Boumerdès and the main shipping wilayas against what
the delivery company actually expects. **Accuracy here is the Product Owner\'s
call, not mine.**

Once approved, the merged dataset is committed as a **local seed file** and never
fetched at runtime (D-210).

---

---

## 30. Glossary

| Term | Meaning |
|---|---|
| **Wilaya** | Algerian administrative province (58 total) |
| **Commune** | Municipality within a wilaya |
| **Bureau** | Pickup at the delivery company's office (stopdesk) |
| **À domicile** | Home delivery |
| **COD** | Cash on delivery |
| **DZD** | Algerian dinar |
| **Variant** | Sellable unit: a colour/size combination of a product |
| **RLS** | Row Level Security (PostgreSQL / Supabase) |
| **Deferred** | Intentionally excluded from V1 with documented reasoning — not forgotten |
| **Snapshot** | Copy of catalogue values frozen onto an order at submission |

## 31. Deliberately Deferred

### 31.1 The governing rule

> **Do not build for hypothetical future requirements.**
> Future-proof only when postponing would require risky changes to production
> data or a major architectural redesign. Otherwise, keep the system as simple
> as possible.

Every additional table, relation or abstraction must justify itself against three
questions:

1. Why does it belong in V1?
2. What future migration does it prevent?
3. What would postponing actually cost?

If the honest answer to (3) is "an additive `CREATE TABLE` or a nullable column",
it does not belong in V1.

### 31.2 Reconciliation with D-008

D-008 requires the database to accommodate future features without redesign.
That is **not** a mandate to create empty tables today. The two rules resolve
cleanly:

| Case | Treatment |
|---|---|
| Retrofit would **alter a table already holding production data** | Build it into V1 (nullable colour/size, `media_type`, nullable commune FK, reserved barcode) |
| Retrofit is a **new standalone table or a nullable column** | Defer it, and document why |

### 31.3 `commune_courier_aliases` — deferred, not forgotten

**Excluded from V1.**

- **No value today.** Its data comes from courier APIs, which are out of scope
  (D-038). The table would be empty.
- **Humans absorb spelling drift.** The administrator reads the commune from the
  dashboard and selects the courier's equivalent visually. Drift only breaks
  machine matching — which begins with courier integration, not before.
- **`is_served` changes nothing today.** An order to an unserved commune is
  discovered on the confirmation call and cancelled, table or no table.
- **Cost of postponing: negligible.** A `CREATE TABLE` with a foreign key to
  `communes`. No existing table altered, no backfill, no downtime, no risk to
  live orders.

**Add it when:** courier API integration enters scope.

### 31.4 Notifications outbox — deferred, not forgotten

**Excluded from V1.**

- Phone calls are the only communication method in V1 (§14.2).
- The order timeline **already records** every call, attempt and outcome with
  administrator, date, time and note. An outbox would duplicate an existing
  feature.
- V1 sends zero automated messages, so the table would be empty.
- **Cost of postponing: negligible.** Purely additive.

**Add it when:** automated WhatsApp or SMS enters scope. At that point the outbox
will be **designed and implemented properly** as part of that feature — including
channel adapters, retry semantics, delivery receipts and opt-out handling — none
of which can be sensibly specified today.

### 31.5 Also deferred

| Feature | Retrofit cost | Trigger |
|---|---|---|
| Customer accounts | Nullable `customer_id` on `orders` | If accounts enter scope |
| Promo / discount codes | New tables + nullable discount columns | If promotions enter scope |
| Courier API integration | New tables + alias layer (§31.3) | If automation enters scope |

---
