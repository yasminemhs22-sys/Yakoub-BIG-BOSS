# Phase 2 — Foundation

**Status: Code Complete. NOT verified.**

I have no network access, so I could not run `npm install`, `tsc` or `vite`.
Nothing below has been compiled or rendered. You run it, I fix what breaks —
the same loop as Phase 1.

---

## What was implemented

**Build and tooling** — Vite 5 · TypeScript strict (`noUncheckedIndexedAccess`,
`noUnusedLocals`) · Tailwind 3.4 · ESLint · Prettier · GitHub Actions CI.

**Design tokens** — the full Neon Street palette from `SPECIFICATION §15.2`, all
derived from the storefront sign and logo. Two type scales, one per script.
One signature effect: a restrained neon glow, reserved for primary actions.

**Internationalisation** — locale type and detection, persistence, document
`lang`/`dir` sync, price/number/date formatting with Western digits pinned in
both locales, silent French fallback for CMS content, and complete FR/AR UI
dictionaries with Arabic typed against French.

**Routing** — `/fr/…` and `/ar/…` prefixes, bare `/` resolving to the detected
language, unknown prefixes redirecting rather than 404ing, admin routes split
into their own lazy chunk.

**Data layer** — validated environment, typed Supabase client, TanStack Query
with defaults tuned for slow mobile networks.

**Safety rails** — error boundary that survives an i18n failure, skeletons
instead of spinners, `prefers-reduced-motion` respected, visible focus rings.

---

## Files created

```
package.json · tsconfig.json · vite.config.ts · tailwind.config.ts
postcss.config.js · netlify.toml · index.html · .eslintrc.cjs
.prettierrc.json · .env.example · .gitignore
.github/workflows/ci.yml

src/
  main.tsx
  styles/global.css
  lib/         env.ts · supabase.ts · database.types.ts
  i18n/        index.tsx · locale.ts · locales/fr.ts · locales/ar.ts
  router/      routes.tsx · LocaleLayout.tsx · NotFound.tsx
  components/  LanguageSwitch.tsx · ErrorBoundary.tsx · Skeleton.tsx
  pages/       storefront/Home.tsx · admin/Login.tsx   (placeholders)

docs/FONTS.md
scripts/check-frontend.py
```

**Database changes: none.** Phase 2 does not touch the schema.

---

## Decisions worth knowing

**The no-flash script in `index.html`.** Locale resolves before first paint.
Without it the page renders French LTR and then snaps to Arabic RTL when React
boots — and because RTL mirrors the entire layout, that flash is severe. It
duplicates a few lines from `locale.ts`; the duplication is deliberate and
commented in both places.

**Arabic gets its own type scale.** Arabic glyphs read optically smaller at the
same pixel size and need more line-height. One shared scale leaves Arabic looking
cramped on every screen.

**Prices pin `ar-DZ-u-nu-latn`.** Plain `ar-DZ` renders Arabic-Indic digits on
most browsers. The locale tag forces Latin numerals, as specified (D-096).

**Language switch preserves the page.** Swapping the prefix rather than bouncing
home. Someone reading a product in French who wants Arabic stays on that product.

**No i18n library.** Almost all customer-facing text comes from the database.
A full i18n framework would add weight to manage two small dictionaries.

**CI enforces the budget.** The build fails above 200 KB gzipped, and fails if
`service_role` appears anywhere in the output.

---

## What you need to do

### 1. Install and run

```bash
npm install
cp .env.example .env      # fill in from Supabase > Settings > API
npm run dev
```

### 2. Fonts

Four `.woff2` files into `public/fonts/`. See `docs/FONTS.md`. **The site works
without them** — text falls back to a system font and looks plainer, not broken.

### 3. Generate database types

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase gen types typescript --linked > src/lib/database.types.ts
```

Until you do, every table is `any`. Untyped and obviously so, rather than
mistyped and quietly wrong.

### 4. Report back

```bash
npm run typecheck
npm run lint
npm run build
```

Send me the **full output of all three**, including warnings. Then open
`http://localhost:5173` and tell me what you see.

---

## What to check in the browser

| Check | Expected |
|---|---|
| `/` | redirects to `/fr` or `/ar` per browser language |
| `/ar` | entire layout mirrors; text right-aligned |
| Language switch | instant, no reload, **stays on the same page** |
| Reload after switching | language persists |
| Price | `3500 DZD` on `/fr`, `3500 د.ج` on `/ar` — **never `٣٥٠٠`** |
| `/fr/xyz` | 404 page in French |
| `/xx/` | redirects, does not 404 |
| Tab key | visible orange focus ring on every control |
| `dist/assets` after build | a separate `Login-*.js` chunk |

---

## Honest status

**Not Verified — everything.** No file here has been compiled. I expect
failures, most likely in this order:

1. **Version drift.** I pinned versions from memory against a May 2026 cutoff.
   Some may not be current. `npm install` will say so.
2. **Tailwind 4 exists** and differs substantially from 3.4. I used 3.4
   deliberately — stable, and its config format is what I know is correct. If you
   prefer 4, say so and I will migrate.
3. **`react-router-dom` v6 vs v7.** I used v6 API. If npm resolves v7, imports
   may need adjusting.
4. **Type errors from strict mode.** `noUncheckedIndexedAccess` is strict on
   purpose and may flag things I did not anticipate.

What I could verify statically: 16 files, all imports resolve, FR and AR
dictionaries match at 67 keys each, no secret in executable code, locale routing
and admin code-splitting present. That check is in
`scripts/check-frontend.py` — it is not a substitute for `tsc`.

---

## Deferred to later phases

Prerendering and crawler meta injection (Phase 10 · C-02) · storefront layout
and header (Phase 6) · real admin auth (Phase 3) · Netlify Functions (Phase 9) ·
sitemap and `hreflang` tags (Phase 10).
