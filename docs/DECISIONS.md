# YAKOUB BIG BOSS — Decision Log

**Document status:** OFFICIAL SOURCE OF TRUTH (companion to `SPECIFICATION.md`)
**Version:** 1.7
**Last updated:** 2026-08-01

> Every locked decision, with its rationale and consequences.
> `LOCKED` decisions may only change by explicit written approval from the
> Product Owner, recorded as a new entry with a new ID.

**Legend**
`PO` = Product Owner decision · `PROP` = Proposed by engineering, approved by PO

---

## A. Project & Method

| ID | Decision | Status | Src |
|---|---|---|---|
| D-001 | Production commercial platform — not a demo, not a prototype | LOCKED | PO |
| D-002 | Built for scalability, security and long-term maintainability | LOCKED | PO |
| D-003 | Phased development; each phase fully finished before the next | LOCKED | PO |
| D-004 | Mandatory complete self-review at the end of every phase | LOCKED | PO |
| D-005 | Never assume requirements — ask instead | LOCKED | PO |
| D-006 | Quality, correctness, maintainability and honesty before speed | LOCKED | PO |
| D-007 | Phase 0 produces the specification and decision log; from then on they are the official source of truth | LOCKED | PO |
| D-008 | Single continuous conversation; repo + spec + log kept synchronised | LOCKED | PO |
| D-009 | If context limits create uncertainty about a prior decision, stop and ask | LOCKED | PO |
| D-010 | Never claim something works unless verified; label unverified claims explicitly | LOCKED | PO |
| D-011 | If a better architecture is found mid-phase, stop and explain before changing plan | LOCKED | PO |
| D-012 | Full re-read of spec and log before each phase; contradictions reported, never silently "improved" | LOCKED | PO |
| D-013 | Anything designed but not executed must be labelled **"Not Verified"** | LOCKED | PO |
| D-014 | Phase reports must additionally include **bugs found and fixed** and **what still needs testing** | LOCKED | PO |

---

## B. Market & Commerce

| ID | Decision | Status | Src |
|---|---|---|---|
| D-020 | Market: **Algeria only** | LOCKED | PO |
| D-021 | Currency: **DZD only** | LOCKED | PO |
| D-022 | **No online payment.** Cash on delivery, processed manually | LOCKED | PO |
| D-023 | No Stripe, PayPal, Adyen, Mollie, or any gateway. **No PCI scope** | LOCKED | PO |
| D-024 | **No customer accounts.** Guest checkout only | LOCKED | PO |
| D-025 | **Shopping cart** — multiple products per order | LOCKED | PO |
| D-026 | Checkout fields: first name, last name, phone, wilaya, commune, delivery method | SUPERSEDED by D-240 | PO |
| D-027 | Delivery price and total update **instantly** on selection | LOCKED | PO |
| D-028 | **No free shipping.** Every order pays delivery | LOCKED | PO |
| D-240 | Checkout fields: first name, last name, phone, wilaya, commune, delivery method, **street address (required for `domicile`, optional for `bureau`)**, **order notes (optional)** | LOCKED | PO |

> **Consequence of D-022/D-024:** there is no payment step and no account
> friction, therefore no natural fraud filter. Anti-fraud measures (D-062) are
> load-bearing, not optional.

---

## C. Geography & Delivery

| ID | Decision | Status | Src |
|---|---|---|---|
| D-030 | Coverage: **historical 58-wilaya model** and all 1,541 communes | LOCKED | PO |
| D-244 | The **69-wilaya reform (Law n° 26-06) is explicitly excluded** from this project | LOCKED | PO |
| D-245 | Rationale for D-244: Algerian delivery companies operate on the 58-wilaya model; pricing and dispatch must match them, not the statute | LOCKED | PO |
| D-246 | Accepted consequence: customers in newly created wilayas select the historical parent wilaya | LOCKED | PO |
| D-247 | Commune names must never be invented; an official, reliable FR+AR dataset is required | LOCKED | PO |
| D-248 | Dataset source presented and approved before import; accuracy over speed | LOCKED | PO |
| D-249 | Primary seed `othmanus/algeria-cities`, **cross-validated** against `DZBuild-com/dzship`; disagreements flagged for PO review | PROPOSED | PROP |
| D-278 | Rejected as primary: lamaridev (no provenance), kossa (wilaya-level upstream), Yalidine API (credentials + runtime fetch) | PROPOSED | PROP |
| D-279 | **Store the wilaya code, never the wilaya name** — courier field-matching depends on it | LOCKED | PROP |
| D-280 | Commune uniqueness scoped to `(wilaya_id, name)`, **never global** — homonym communes exist across wilayas | LOCKED | PROP |
| D-281 | `commune_courier_aliases` table | **REVERSED — deferred, see D-285** | PROP |
| D-282 | Original rationale for D-281 | **WITHDRAWN — retrofit is additive, not a redesign** | PROP |
| D-250 | Reference data committed as a **local seed file**, never fetched at runtime | LOCKED | PROP |
| D-031 | Delivery methods: **Bureau** and **À domicile** | LOCKED | PO |
| D-032 | Delivery pricing **per wilaya only** — two prices (office, home) | LOCKED | PO |
| D-033 | Communes used for address and order management, not pricing | LOCKED | PO |
| D-034 | Schema must allow commune-level pricing later **without redesign** (nullable commune FK from day one) | LOCKED | PO |
| D-035 | Delivery prices managed entirely by the administrator | LOCKED | PO |
| D-036 | Per-order editable: delivery company, tracking number, shipping date, estimated delivery date | LOCKED | PO |
| D-037 | Delivery companies stored as data: Yalidine, ZR Express, Noest, Custom | LOCKED | PO |
| D-038 | Delivery-company **API integrations out of scope** for v1 | LOCKED | PROP |

---

## D. Inventory

| ID | Decision | Status | Src |
|---|---|---|---|
| D-040 | Stock decreases **only** on administrator confirmation | LOCKED | PO |
| D-041 | Order submission **never** reserves stock | LOCKED | PO |
| D-042 | Rationale: COD stores receive fake orders; reserving on submit lets bad actors deplete inventory at zero cost | LOCKED | PO |
| D-043 | Stock modelled as a **movement ledger**, not a bare integer | LOCKED | PROP |
| D-044 | `returned` restores stock; `cancelled` after confirmation restores stock | LOCKED | PROP |
| D-045 | Stock lives on the **variant**, never on the product | LOCKED | PROP |
| D-046 | Out-of-stock variants are **disabled and visible**, never hidden | LOCKED | PROP |
| D-047 | Exact quantities not shown above a configurable threshold | LOCKED | PROP |

---

## E. Orders

| ID | Decision | Status | Src |
|---|---|---|---|
| D-050 | Order statuses stored as **data**, not a code enum | LOCKED | PROP |
| D-051 | Statuses: `new`, `pending_confirmation`, `unreachable`, `confirmed`, `preparing`, `ready_to_ship`, `shipped`, `delivered`, `cash_collected`, `returned`, `cancelled`, `fake` | LOCKED | PROP |
| D-052 | `delivered` and `cash_collected` are **separate** — the delivery company remits later, and merging would misstate cash position | LOCKED | PROP |
| D-053 | `returned` and `fake` are **separate** — returns are normal, fake is a fraud signal | LOCKED | PROP |
| D-054 | Every order has an internal timeline | LOCKED | PO |
| D-055 | Each timeline entry stores: administrator, date, time, optional note | LOCKED | PO |
| D-056 | Timeline is append-only — never editable or deletable | LOCKED | PROP |
| D-057 | Orders **snapshot** product names (FR+AR), variant details, unit price, delivery fee and totals at submission | LOCKED | PROP |
| D-058 | Rationale for D-057: later catalogue edits must never retroactively alter historical orders | LOCKED | PROP |
| D-059 | Order tracking by phone + reference number, no account | LOCKED | PROP |
| D-060 | Confirmation screen shows a screenshot-friendly reference number | LOCKED | PROP |
| D-061 | `unreachable` carries an attempt counter and next-retry date | LOCKED | PROP |
| D-062 | Anti-fraud: phone validation, rate limiting (IP + phone), duplicate detection, honeypot, blocklist fed by `fake` | LOCKED | PROP |

---

## F. Catalogue

| ID | Decision | Status | Src |
|---|---|---|---|
| D-070 | Categories fully admin-managed; **nothing hardcoded** | LOCKED | PO |
| D-071 | Sizes created by the administrator; each product may use a different system (`S–XXL`, `38–42`, `One Size`) | LOCKED | PO |
| D-072 | Colours created by the administrator; each product selects its own | LOCKED | PO |
| D-073 | Colours carry a hex value for swatch rendering | LOCKED | PROP |
| D-074 | Sizes carry `sort_order` and `size_group` so ordering is automatic | LOCKED | PROP |
| D-075 | Variant = colour × size, with **both nullable** | LOCKED | PROP |
| D-076 | Variant fields: stock, SKU, optional price adjustment, optional image, reserved barcode | LOCKED | PO |
| D-077 | SKUs **auto-generated**, with manual override allowed | LOCKED | PO |
| D-078 | Unlimited product images | LOCKED | PO |
| D-079 | Drag-and-drop image ordering, persisted | LOCKED | PO |
| D-080 | Exactly one featured image per product | LOCKED | PO |
| D-081 | `media_type` column from day one so video needs no migration | LOCKED | PROP |
| D-082 | All prices dynamic, from the database; no predefined ranges | LOCKED | PO |
| D-292 | Phone validation rules (country code, national length, mobile prefixes) are **configurable from `settings`**. Deliberate exception to D-283: new Algerian mobile prefixes are a recurring real event. Consequence: the function is STABLE, not IMMUTABLE, so it cannot be used in an index | LOCKED | PO |
| D-293 | Product↔category is **many-to-many** via `product_categories`, with `is_primary` for breadcrumbs and the canonical URL | LOCKED | PO |
| D-294 | `menus` table **kept** — a third menu becomes a row, not a migration, and unlike the deferred tables it is not empty in V1 | LOCKED | PO |
| D-295 | Curated shelf ("Choix du Boss") stays a `product_carousel` CMS block holding product ids; **no `collections` table** | LOCKED | PO |
| D-296 | Wilaya/commune mapping stays **configurable from the database**; Timimoun = 49 is **PROVISIONAL** and must never be hardcoded into business logic | LOCKED | PO |
| D-241 | Every product supports **Original Price** (required) and **Sale Price** (optional) | LOCKED | PO |
| D-242 | If no sale price exists, only the normal price is displayed — no strike-through | LOCKED | PO |
| D-243 | Sale price must validate as lower than original; the active price feeds cart, totals and snapshot | LOCKED | PROP |

---

## G. Languages

| ID | Decision | Status | Src |
|---|---|---|---|
| D-090 | Fully bilingual: French and Arabic (RTL) | LOCKED | PO |
| D-091 | Language switch is instant, without page reload | LOCKED | PO |
| D-092 | Every CMS-editable field exists in both languages | LOCKED | PO |
| D-093 | Missing Arabic falls back to French; a section is never empty | LOCKED | PO |
| D-094 | Fallback is **completely silent** for customers | LOCKED | PO |
| D-095 | The dashboard clearly indicates missing translations | LOCKED | PO |
| D-096 | **Western numerals everywhere** (`1500 DZD`, `1500 د.ج`). Never `١٥٠٠` | LOCKED | PO |
| D-097 | First visit: detect browser language → Arabic if Arabic, else French | LOCKED | PO |
| D-098 | User's explicit choice persisted locally and wins over detection | LOCKED | PO |
| D-099 | Locale-prefixed URLs `/fr/` and `/ar/` with `hreflang` — required for indexability | LOCKED | PROP |
| D-100 | Language switch preserves the current page, never bounces to home | LOCKED | PROP |
| D-101 | Separate type scales per script (Arabic optical size differs) | LOCKED | PROP |
| D-102 | Owner authors all FR/AR content later via the dashboard; content-entry speed is a design requirement | LOCKED | PO |

---

## H. Administration

| ID | Decision | Status | Src |
|---|---|---|---|
| D-110 | Administrator has complete control — everything visible is editable without code | LOCKED | PO |
| D-111 | Multiple administrator accounts | LOCKED | PO |
| D-112 | Minimum roles: Super Admin, Administrator, Content Manager | LOCKED | PO |
| D-113 | Role system scalable for future roles | LOCKED | PO |
| D-114 | Permissions stored as **data** (`role_permissions`), not code branches | LOCKED | PROP |
| D-115 | Supabase Auth used for staff only; storefront is anonymous | LOCKED | PROP |
| D-116 | Audit log of every administrative write | LOCKED | PROP |
| D-117 | Order workspace must work well on a mobile screen (admin works by phone) | LOCKED | PROP |
| D-118 | Variant matrix editor (colour × size grid) for bulk stock entry | LOCKED | PROP |
| D-119 | Delivery price editor as a single 58-row inline-editable table | LOCKED | PROP |

---

## I. CMS

| ID | Decision | Status | Src |
|---|---|---|---|
| D-130 | Entire website CMS-driven; nothing hardcoded except business logic | LOCKED | PO |
| D-131 | All content comes from Supabase | LOCKED | PO |
| D-132 | Content authored as **typed, validated blocks** | LOCKED | PROP |
| D-133 | Raw HTML authoring is **forbidden** — layout breakage and stored-XSS risk | LOCKED | PROP |
| D-134 | Homepage blocks reorderable and individually toggleable | LOCKED | PROP |
| D-135 | Business email is a CMS setting, added later without code changes | LOCKED | PO |
| D-136 | Opening hours are CMS-editable, filled in later | LOCKED | PO |
| D-137 | Legal pages built now, content supplied before launch: Privacy Policy, Return Policy, Terms & Conditions | LOCKED | PO |
| D-138 | No placeholder or lorem text ever shipped to production | LOCKED | PROP |
| D-139 | SEO metadata editable per page **per language** | LOCKED | PROP |

---

## J. Integrations

| ID | Decision | Status | Src |
|---|---|---|---|
| D-150 | Google Sheets sync is **mandatory** | LOCKED | PO |
| D-151 | Every **confirmed** order appears automatically in Google Sheets | LOCKED | PO |
| D-152 | **A single sheet** with all orders. No monthly tabs. Admin uses filters | LOCKED | PO |
| D-153 | Everything implemented except authentication; owner only pastes credentials | LOCKED | PO |
| D-154 | Sync is **one-way**. Sheets is a reporting mirror, not a source of truth | LOCKED | PROP |
| D-155 | Queue-based with retry, so Sheets failure never blocks confirmation | LOCKED | PROP |
| D-156 | Manual re-sync control in the dashboard | LOCKED | PROP |
| D-157 | Google credentials live in Netlify Functions env vars, never client-side | LOCKED | PROP |
| D-158 | Customer communication primarily by phone call | LOCKED | PO |
| D-159 | WhatsApp/SMS prepared via an outbox table | **SUPERSEDED by D-286** | PO |

---

## K. Stack & Deployment

| ID | Decision | Status | Src |
|---|---|---|---|
| D-170 | Stack: React · Vite · Tailwind CSS · Supabase · Netlify | LOCKED | PO |
| D-171 | Forbidden: Next.js, Shopify, WordPress, Firebase | LOCKED | PO |
| D-172 | Build-time prerendering + Netlify Edge Functions for SEO and social previews | LOCKED | PO |
| D-173 | Rationale for D-172: social crawlers do not execute JS; without it, every shared link shows a blank preview | LOCKED | PROP |
| D-174 | Netlify Functions for all secret-bearing operations | LOCKED | PROP |
| D-175 | Supabase `service_role` key never reaches the browser | LOCKED | PROP |
| D-176 | No domain registered yet; temporary Netlify dev domain | LOCKED | PO |
| D-177 | Site URL read from a single env var (canonicals, hreflang, sitemap, OG, JSON-LD) | LOCKED | PROP |
| D-251 | **Netlify Build Hooks** fire on CMS publish; storefront stays hydrated with live data for users | LOCKED | PO |
| D-252 | Rebuilds are **debounced** so a burst of edits triggers one build | LOCKED | PROP |
| D-253 | Rebuild status visible in the dashboard with a manual "rebuild now" control | LOCKED | PROP |

---

## L. Brand & Design

| ID | Decision | Status | Src |
|---|---|---|---|
| D-190 | Official name: **`YAKOUB BIG BOSS`** — this spelling everywhere | LOCKED | PO |
| D-191 | Official Arabic location spelling: **حلايمية** | LOCKED | PO |
| D-192 | Logo **not** redesigned or replaced; identity unchanged | LOCKED | PO |
| D-193 | Permitted: transparency, resolution cleanup, favicon and app-icon generation | LOCKED | PO |
| D-194 | Official Instagram and TikTok handle: `yakoub_big_boos` | LOCKED | PO |
| D-195 | Design direction: **"Neon Street"** — dark, high-contrast, bold, derived from the storefront sign | LOCKED | PROP |
| D-196 | Palette derived from the logo and sign; only `#22C55E` (success) added, as no brand equivalent existed | LOCKED | PROP |
| D-197 | Orange `#FF6A00` reserved for primary actions only | LOCKED | PROP |
| D-198 | Typography: Anton/Archivo Black + Cairo ExtraBold (display); Inter + IBM Plex Sans Arabic/Tajawal (body) | LOCKED | PROP |
| D-199 | Fonts self-hosted; no Google Fonts CDN | LOCKED | PROP |
| D-200 | Product page includes a secondary "Order via WhatsApp" action with prefilled product and SKU | LOCKED | PROP |
| D-201 | Product page includes a delivery estimator (wilaya → price) before checkout | LOCKED | PROP |
| D-202 | Curated shelf is manual, not algorithmic, at this catalogue size | LOCKED | PROP |

---

## M. Assets & Compliance

| ID | Decision | Status | Src |
|---|---|---|---|
| D-210 | **All assets local.** No Unsplash, no external images, no hotlinking | LOCKED | PO |
| D-211 | Only owner-supplied brand assets plus generated non-branded placeholders | LOCKED | PO |
| D-212 | Behance package generated from real screenshots of the finished site | LOCKED | PO |
| D-213 | The site must **never** display or promote counterfeit or unauthorised branded products | LOCKED | PO |
| D-214 | The system stays completely generic and works for any clothing products | LOCKED | PO |
| D-215 | No third-party trademarks in seed data, placeholders, demo content or Behance material | LOCKED | PROP |

---

## N. Quality Attributes

| ID | Decision | Status | Src |
|---|---|---|---|
| D-230 | Target device: mid-range Android on 3G | LOCKED | PROP |
| D-231 | Budgets: LCP < 2.5s on 4G; storefront JS < 200KB gzipped | LOCKED | PROP |
| D-232 | Admin bundle never shipped to storefront visitors | LOCKED | PROP |
| D-233 | RLS is the primary security model, reviewed as a first-class deliverable | LOCKED | PROP |
| D-234 | Orders and customer PII: **no public read, ever** | LOCKED | PROP |
| D-235 | Every RLS policy tested with an anonymous key before launch | LOCKED | PROP |
| D-236 | WCAG AA contrast on all colour pairings | LOCKED | PROP |
| D-237 | Cursor-based pagination; explicit column selection, never `select *` | LOCKED | PROP |
| D-238 | Backup and restore procedure decided before real orders exist | LOCKED | PROP |
| D-297 | Append-only guards are **cascade-aware** via `pg_trigger_depth()`: they distinguish who is writing, not what is written. Direct writes refused for every column; referential actions permitted | LOCKED | PROP |
| D-298 | Rationale for D-297: enumerating allowed columns broke at each new foreign key (3 symptoms, 1 cause). Depth-based detection covers foreign keys added in future with no change | LOCKED | PROP |
| D-299 | `stock_movements.variant_id` is `ON DELETE SET NULL`, not CASCADE — the ledger is an accounting record and outlives the product it describes, mirroring `order_items` (D-057) | LOCKED | PROP |
| D-300 | `app.has_permission` and `app.current_admin_id` are executable by `authenticated` — the dashboard needs them to hide unauthorised controls. They expose only the caller's own permissions | LOCKED | PROP |

---

## O3. Simplicity Rule

| ID | Decision | Status | Src |
|---|---|---|---|
| D-283 | **Do not build for hypothetical future requirements.** Future-proof only when postponing would require risky changes to production data or major architectural redesign | LOCKED | PO |
| D-284 | Every additional table, relation or abstraction must justify: why in V1, what migration it prevents, what postponing costs | LOCKED | PO |
| D-285 | `commune_courier_aliases` **removed from V1** — would be empty, humans absorb spelling drift, retrofit is a plain additive `CREATE TABLE`. Documented as deferred, not forgotten | LOCKED | PO |
| D-286 | Notifications outbox **removed from V1** — phone is the only channel and the order timeline already records all communication. Automated WhatsApp/SMS will be designed and implemented only when that feature enters scope | LOCKED | PO |
| D-287 | Reconciliation of D-283 with D-008: build into V1 only when retrofit would **alter a table already holding production data**; defer when retrofit is a new standalone table or a nullable column | LOCKED | PROP |
| D-288 | Retained as genuine V1 requirements after audit: `stock_movements`, `sync_queue`, `role_permissions`, nullable colour/size, `sku_is_custom`, status table, `media_type`, nullable commune FK, reserved barcode | LOCKED | PROP |

---

## O2. Resolved Architecture (C-series)

| ID | Decision | Status | Src |
|---|---|---|---|
| D-260 | Variant uniqueness via `UNIQUE NULLS NOT DISTINCT (product_id, color_id, size_id)` | LOCKED | PROP |
| D-289 | **PostgreSQL 15+ is the design baseline**, not an immutable assumption. It must never block development | LOCKED | PO |
| D-290 | **Fallback Strategy:** if the live project runs PG ≤ 14, swap to a `COALESCE` expression index. Isolated to one migration file; no schema, query or code changes | LOCKED | PO |
| D-291 | Actual PG version confirmed when the Supabase project is created; until then recorded as Not Verified | LOCKED | PO |
| D-261 | Order confirmation is a single PostgreSQL RPC in one transaction with `SELECT … FOR UPDATE` row locks | LOCKED | PROP |
| D-262 | Insufficient stock at confirmation is a **hard block** by default, returning which lines are short | LOCKED | PROP |
| D-263 | Oversell override gated by an `orders.oversell` permission, requiring a mandatory note, recorded in timeline and audit log | LOCKED | PROP |
| D-264 | The confirmation RPC validates that the requested status transition is legal from the current status | LOCKED | PROP |
| D-265 | Arabic URLs enter the sitemap and `hreflang` **only when essential Arabic fields exist**; storefront fallback stays silent | LOCKED | PROP |
| D-266 | `noindex` rejected for untranslated pages as too blunt | LOCKED | PROP |
| D-267 | Communes are **never bundled**; fetched per selected wilaya, memoised per session, indexed on `wilaya_id` | LOCKED | PROP |
| D-268 | Phone stored twice: `phone_raw` (as typed) and `phone_e164` (canonical). All matching uses `phone_e164` | LOCKED | PROP |
| D-269 | Order reference format `YBB-YYMMDD-XXXX`, Crockford base32, server-generated, non-sequential | LOCKED | PROP |
| D-270 | Rationale for D-269: sequential references leak order volume and invite enumeration | LOCKED | PROP |
| D-271 | SKU globally unique; manual edits allowed with clear collision errors; `sku_is_custom` prevents overwrite on regeneration | LOCKED | PROP |
| D-272 | Featured image enforced by `UNIQUE (product_id) WHERE is_featured`; deletion promotes the next by `sort_order`; imageless products cannot be published | LOCKED | PROP |
| D-273 | Cart stores **only** `variant_id` and quantity — never prices | LOCKED | PROP |
| D-274 | Order totals computed **server-side** from the database on every request; client-supplied prices are never trusted | LOCKED | PROP |
| D-275 | Cart revalidated on view and at submission; changes surfaced and acknowledged | LOCKED | PROP |
| D-276 | Line-item snapshots immutable; delivery fee recalculated on wilaya/method change with both values in the timeline | LOCKED | PROP |
| D-277 | Manual delivery fee override available to the administrator, audited | LOCKED | PROP |

---

## O. Open Items

Items not blocking Phase 1, to be resolved before the phase that needs them.

| ID | Item | Needed by |
|---|---|---|
| O-001 | Business email address | Before launch |
| O-002 | Opening hours | Before launch |
| O-003 | Exact store map coordinates | Phase 6 |
| O-004 | Return policy text | Before launch |
| O-005 | Privacy policy text | Before launch |
| O-006 | Terms & conditions text | Before launch |
| O-007 | Delivery prices for all 58 wilayas | Before launch |
| O-008 | Product photography standard (aspect ratio, background) | Phase 5 |
| O-009 | Domain registration | Phase 12 |
| O-010 | Google service-account JSON + sheet shared | Phase 9 |
| O-011 | Supabase project created, keys available | Phase 1 |
| O-012 | Netlify site created | Phase 2 |
| O-013 | Low-stock alert threshold value | Phase 8 |
| O-014 | Stock-quantity display threshold (D-047) | Phase 6 |
| O-015 | PO spot-check of `othmanus/algeria-cities` commune spellings (Boumerdès + main shipping wilayas) | **Phase 1 — blocking** |
| ~~O-016~~ | Resolved → D-030, D-244 | ✅ Closed |
| ~~O-017~~ | Resolved → 58-wilaya model locked | ✅ Closed |
| ~~O-018~~ | Resolved → D-251, D-252, D-253 | ✅ Closed |
| ~~O-019~~ | Resolved → D-261 … D-264 | ✅ Closed |
| ~~O-020~~ | Resolved → D-268 … D-277 | ✅ Closed |
| O-021 | Confirm live PostgreSQL version; apply D-290 fallback if ≤ 14 | When Supabase project is created — **non-blocking** |

---

## P. Superseded Decisions

> **Note for readers and tooling:** IDs in this table intentionally repeat their
> live entry above. This is the change log, not a second definition. A uniqueness
> check must scope to the sections preceding this one.

| ID | Original | Superseded by | Reason |
|---|---|---|---|
| — | Payment gateway architecture (Stripe/PayPal/Adyen/Mollie) | D-022, D-023 | No online payment |
| — | Customer registration, login, password reset | D-024 | Guest checkout only |
| — | Monthly tabs in Google Sheets | D-152 | Single sheet with filters |
| — | Name variants `YAKOUB-BIG-BOSS`, `Yakoub BiG BOOS` | D-190 | One official spelling |
| — | Arabic spelling حلايمة | D-191 | Official spelling is حلايمية |
| — | Proposed clean vector wordmark | D-192 | Owner keeps logo unchanged |
| D-026 | Six checkout fields, no address | D-240 | Address required for home delivery; notes approved |
| D-159 | Notifications outbox table in V1 | D-286 | Empty table duplicating the order timeline |
| D-281 | `commune_courier_aliases` in V1 | D-285 | Empty table; retrofit is purely additive |

---

## Change Procedure

1. Product Owner states the change explicitly in writing.
2. A **new** entry is added with a new ID.
3. The superseded entry moves to section P with a reason.
4. `SPECIFICATION.md` is updated in the same commit.
5. Impact on already-completed phases is assessed and reported before proceeding.

Entries are never silently edited or deleted.
