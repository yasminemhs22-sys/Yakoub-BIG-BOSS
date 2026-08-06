# YAKOUB BIG BOSS

Production e-commerce platform for a men's clothing shop in Boudouaou, Boumerdès.

Bilingual French / Arabic · cash on delivery · 58 wilayas · no online payment,
no customer accounts.

---

## Stack

React 18 · TypeScript (strict) · Vite 5 · Tailwind 3 · Supabase (PostgreSQL 17) ·
Netlify Functions and Edge Functions.

---

## Getting started

```bash
npm install
cp .env.example .env      # fill from Supabase → Settings → API
npm run dev
```

Then apply the database. See `docs/DEPLOYMENT.md` — the migrations must run in
order, once.

```bash
npm run typecheck   # TypeScript, strict
npm run lint        # ESLint
npm run build       # production bundle
```

---

## Layout

```
src/
  auth/          staff authentication, permission gates
  components/    shared · admin/ · storefront/
  i18n/          locale, formatting, FR + AR dictionaries
  lib/           supabase client, env, cart, seo, images, blocks
    queries/     one module per domain
  pages/         storefront/ · admin/
  router/        locale-prefixed routes

supabase/
  migrations/    0001-0016, apply in order
  seed/          system data · geography (pending)
  tests/         218-assertion verification suite

netlify/
  functions/     place-order · sheets-sync · sitemap · robots
  edge-functions/ seo-meta

docs/            specification, ERD, runbooks, Behance package
scripts/         static checks that enforce the architecture
```

---

## The rules that hold this together

Written down because each one, if quietly broken, produces a bug that is
expensive to find later. `scripts/check-frontend.py` fails the build on most of
them, and CI runs it on every push.

**The cart stores variant ids and quantities. Never prices.** Every monetary
value is computed server-side in `place_order()` from the database. A tampered
request cannot change what an order costs.

**Stock moves only on admin confirmation.** Placing an order reserves nothing.
Cash-on-delivery shops receive fake orders, and reserving stock on submission
lets a bad actor empty the shelves for free.

**Stock is a ledger, not a counter.** `stock_movements` is append-only and is
the source of truth; `stock_on_hand` is a cache maintained by trigger. Nothing
writes it directly.

**Orders snapshot what was sold.** Renaming or repricing a product never alters
a placed order.

**Row Level Security is the security model.** The anon key is public by design —
it ships in the browser bundle. Phase 1 verified with 218 executed assertions
that an anonymous session can read no order, no customer, no admin, no audit
row, and can write nothing at all.

**`service_role` never enters `src/`.** It lives in Netlify environment
variables. CI fails the build if it appears in the output.

**Content is typed blocks, never raw HTML.** No path exists from the CMS to
injected script.

**Missing Arabic falls back to French silently for customers, loudly in the
dashboard.** Google is told the truth: the Arabic URL enters the sitemap only
when Arabic content actually exists.

---

## Verification status

| Phase | Status |
|---|---|
| 1 — Database | **Verified** on PostgreSQL 17.6 · 218/218 assertions |
| 2–12 — Application | **Code complete, not yet executed end to end** |

The one item still outstanding from Phase 1 is the concurrency test: the final
state was correct, but the two sessions never actually competed for a row lock,
so `SELECT … FOR UPDATE` remains unproven. It must be re-run with `psql` before
production. See `docs/RUNBOOK_OPERATIONS.md` §4.

---

## Documentation

| File | Contents |
|---|---|
| `docs/SPECIFICATION.md` | 31 sections, the authoritative requirements |
| `docs/DECISIONS.md` | 199 numbered decisions with rationale |
| `docs/DEPLOYMENT.md` | Step by step, from empty Supabase project to live site |
| `docs/RUNBOOK_OPERATIONS.md` | Backups, security audit, incident response |
| `docs/erd/` | Entity diagrams and the full foreign-key inventory |
| `docs/BEHANCE.md` | Case study and screenshot capture guide |
| `docs/FONTS.md` | Self-hosted fonts — four files you must download |
| `supabase/tests/README.md` | How to run the verification suite |
