# Behance Package

**Local assets only. No Unsplash, no stock photography, no external images
(D-210, D-211).** Every frame must come from the finished site or from the
owner's own brand assets.

---

## What I can and cannot produce

I have no browser and no running site, so **I cannot take the screenshots**. The
specification is explicit that they must come from the real, finished website
(D-212) — not mockups, and certainly not invented imagery.

What follows is everything else: the written case study, the exact shot list,
and the capture settings. You take the shots; the presentation is already
written around them.

---

## Case study

### Title

**YAKOUB BIG BOSS — Bilingual commerce for a cash-on-delivery market**

### Summary

A production e-commerce platform for a men's clothing shop in Boudouaou,
Algeria. Fully bilingual French and Arabic with complete RTL support, built
around cash on delivery — no online payment, no customer accounts, and a
58-wilaya delivery network priced by the owner.

### The problem

Most e-commerce templates assume a card payment and a registered customer.
Algerian retail works differently: the customer orders, the shop phones to
confirm, the courier collects cash on the doorstep.

That inverts several assumptions at once. Without a payment step there is no
fraud filter, so the order form is the entire attack surface. Without accounts
there is no order history to return to. And the shop's audience arrives almost
entirely from TikTok and Instagram links, on mid-range Android phones, on mobile
data.

### The approach

**Two languages, one product — not a translated afterthought.** Arabic gets its
own type scale, because Arabic glyphs read optically smaller at the same pixel
size. Layout mirrors completely through CSS logical properties. Prices use
Western digits in both languages so the same figure never looks like two
different amounts.

**Stock moves only when a human confirms.** Fake orders are the defining risk of
cash on delivery. Reserving stock on submission would let anyone empty the
shelves for free, so inventory leaves only when the owner has spoken to the
customer. Confirmation runs as a single database transaction with row locks, so
two staff members cannot both sell the last unit.

**The browser never sends a price.** The cart carries product ids and quantities
and nothing else; every figure is computed server-side. A tampered request
cannot change what an order costs.

**The dashboard was designed for a phone in a shop.** The owner confirms orders
standing behind the counter, so the call button comes first, the note field sits
beside it, and the whole layout works one-handed before it works on a desktop.

**Everything visible is editable.** Content is authored as typed, validated
blocks — never a raw HTML box, which would let a careless edit break the layout
or inject script into the brand's own site.

### Design direction

The palette is taken from the shop's own illuminated storefront sign: near-black
surfaces, silver letter faces, and the hot orange of the neon edging reserved
for primary actions only. One signature effect — a restrained glow on the order
button — echoes that sign and appears nowhere else.

Nothing was imported from a trend board. The brand already had a visual identity
lit up over its door.

### Verification

The database layer was verified against a live PostgreSQL 17 instance with 218
executed assertions covering inventory rules, price integrity, order snapshots,
fraud controls, role isolation and anonymous access.

Three real schema defects surfaced only during execution — all sharing one root
cause, where append-only guards were blocking the database's own referential
actions. A green static analysis had missed all three.

---

## Shot list

Capture in this order. Each frame has a reason for existing.

### Storefront

| # | Frame | Setup |
|---|---|---|
| 1 | Homepage, French, desktop | Hero + category strip visible |
| 2 | Homepage, Arabic, desktop | **Same scroll position** — the mirror is the point |
| 3 | Homepage, mobile, both languages | 390×844, side by side |
| 4 | Product page, French, desktop | Colour swatches and size buttons visible |
| 5 | Product page, Arabic, mobile | Sticky order bar in frame |
| 6 | **Size selector with an unavailable size** | Disabled and struck through, not hidden |
| 7 | **Delivery estimator, wilaya selected** | Both prices shown before checkout |
| 8 | Category listing | A full grid of real products |
| 9 | Cart with 2–3 items | Real product images |
| 10 | Checkout, home delivery selected | Address field revealed, live total |
| 11 | Order confirmation | Reference number large |
| 12 | Order tracking, result shown | Status badge visible |

### Dashboard

| # | Frame | Setup |
|---|---|---|
| 13 | Orders list with status filters | Several statuses represented |
| 14 | **Order workspace on mobile** | Call button at top — the design argument |
| 15 | Order timeline | Several entries, different actors |
| 16 | **Insufficient stock on confirm** | The panel naming the short lines |
| 17 | **Variant matrix** | 4+ colours × 4+ sizes, some ticked |
| 18 | Product editor, bilingual fields | Missing-translation badge visible |
| 19 | Media library | Grid populated |
| 20 | Google Sheets panel | Counters showing real sync activity |
| 21 | Security audit panel | Zero findings |

Shots **6, 7, 14, 16, 17** carry the case study. They show decisions, not
screens.

---

## Capture settings

**Desktop:** 1440×900, browser at 100% zoom, DevTools closed. Hide bookmarks and
extensions — a personal browser chrome cheapens an otherwise clean frame.

**Mobile:** DevTools device toolbar, iPhone 14 Pro (390×844) or Pixel 7
(412×915). Screenshot the viewport only, not the emulator frame.

**Before you start:**

- Install the fonts (`docs/FONTS.md`). Screenshots taken with the system
  fallback will look noticeably plainer than the real thing.
- Seed **real content**: 8–12 products with genuine photography, real prices in
  DZD, real category names, Arabic filled in. Empty states and Lorem ipsum are
  what make a case study look unfinished.
- Confirm a couple of orders so the timeline and the Sheets panel have history.

**⚠️ No third-party trademarks in any frame** (D-213, D-215). Check every
product photo before capture, including reflections and background shelving. A
monogram visible in the corner of a shot is a permanent, indexed, public record.

---

## Presentation order

1. Cover — logo on the near-black base, tagline in both languages
2. Context — the shop, the market, the constraint
3. The bilingual problem, with shots 1–3
4. Product page and the delivery estimator, shots 4–7
5. Checkout flow, shots 9–11
6. The dashboard as a phone tool, shots 13–17
7. Under the hood — schema diagram from `docs/erd/`, the 218-assertion result
8. Closing — the palette derived from the storefront sign

---

## Assets already in the repository

- `docs/erd/*.mermaid` — render at high resolution for the technical section
- The brand palette, in `tailwind.config.ts`, each colour traced to its source
- The owner's logo and storefront photograph

Nothing else is needed, and nothing else may be added from outside.
