# Phase 1 — Verification Report

**Project:** YAKOUB BIG BOSS
**Database:** Supabase · PostgreSQL 17.6 (aarch64)
**Executed by:** Product Owner, in the Supabase SQL Editor
**Analysed by:** Claude
**Date:** 2 August 2026

**Status: VERIFIED COMPLETE — with one documented exception (§6).**

---

## 1. What was executed

| Step | Result |
|---|---|
| 35 migration chunks applied in order | ✅ no errors |
| System seed applied | ✅ |
| Structure verification (33 tables, RLS, indexes) | ✅ |
| Test harness installed | ✅ |
| Four automated test files | ✅ |
| Direct anon write probe | ✅ |
| Ledger guard probes (2 rounds) | ✅ |
| Concurrency test | ⚠️ partially — see §6 |
| Cleanup | ✅ zero residue |

---

## 2. Test results

**218 of 218 assertions passed.**

| Suite | Passed | Failed |
|---|---|---|
| 01 — structure | 26 | 0 |
| 02 — functions | 24 | 0 |
| 03 — constraints & triggers | 40 | 0 |
| 04 — order lifecycle | 22 | 0 |
| 05 — confirmation | 16 | 0 |
| 06 — transitions | 17 | 0 |
| 07 — sheets queue | 7 | 0 |
| 08 — RLS anon | 26 | 0 |
| 09 — RLS admin roles | 24 | 0 |
| anon write probe | 8 | 0 |
| ledger guard v1 | 4 | 0 |
| ledger guard v2 | 5 | 0 |

### Structure confirmed against the live database

```
tables 33 · policies 124 · rls_disabled 0
statuses 12 · transitions 23 · roles 3 · permissions 14
role_perms 23 · settings 19 · pages 5 · methods 2 · companies 4 · menus 2
```

Every figure matched the specification exactly.

---

## 3. What is now proven, not assumed

**Inventory.** Placing an order does not reserve stock. Stock leaves only on
confirmation and returns only when the order had actually been confirmed.
Cancelling an unconfirmed order does not invent stock.

**Money.** Order totals are computed server-side. Renaming or repricing a product
does not alter a placed order — the snapshot holds.

**Overselling.** Insufficient stock is a hard block that names the short line.
The override requires both the permission and a mandatory note, and is recorded.

**Security.** With the `anon` role active: zero reads of orders, order items,
timeline, admin users, audit log, blocklist, stock movements, private settings or
unpublished products. Zero successful writes across eight attempted attacks
including forging an audit entry and changing an order total.

**Least privilege.** A Content Manager cannot read a single customer record.
An Administrator can confirm orders but cannot oversell, manage roles, manage
admins, view the audit log or change settings. This is the direct proof of the
fix for the leak found during self-review — it is no longer a claim.

**Uniqueness.** `UNIQUE NULLS NOT DISTINCT` verified working on PG 17. The
PostgreSQL 14 fallback (D-290) is confirmed unnecessary.

**Integration.** A failed Sheets sync leaves the confirmation and the stock
movement intact; failed rows are re-claimed for retry and stop after five
attempts.

---

## 4. Defects found and fixed

Six defects. **Three were real schema bugs; all three surfaced only during
execution.**

### #1 — Extension guard used the wrong function *(test defect)*

`to_regproc('public.unaccent')` returns NULL for ambiguous names, and `unaccent`
has two overloads. The guard fired on a healthy database.
**Fix:** `to_regprocedure('public.unaccent(text)')` with an explicit signature.

### #2 — `language sql` helpers created before their tables *(schema defect)*

`current_admin_id()` and `has_permission()` read `admin_users`, created two
migrations later. PostgreSQL validates SQL function bodies at CREATE time.
**Fix:** moved to `0003_identity.sql`. `check_function_bodies = off` was
deliberately rejected — it would have hidden a real dependency.
**Gap exposed:** the static checker validated foreign keys and table order but
not table references inside function bodies. A new check now covers this.

### #3 — RESTRICT test ordering *(test defect)*

A preceding block removed the product↔category link, so the category was no
longer in use when the test asserted it could not be deleted. Verified separately
that `ON DELETE RESTRICT` works correctly.
**Fix:** the test now creates its own linked pair.

### #4, #5, #6 — Append-only guards blocked referential integrity *(schema defect)*

One root cause, three symptoms:

| # | Symptom | Constraint involved |
|---|---|---|
| 4 | Deleting an order impossible | `order_timeline` CASCADE |
| 5 | Still impossible, one layer deeper | `stock_movements.order_id` SET NULL |
| 6 | **Deleting any product with stock history impossible** | `stock_movements.variant_id` CASCADE |

The guards blocked every UPDATE and DELETE, including those the database itself
performs while enforcing foreign keys. #6 was the most serious: it meant no real
product could ever be deleted. The error message also named the wrong table,
misleading anyone reading it.

**Two failed attempts** — adding an exception for the timeline, then enumerating
allowed columns — each broke at the next foreign key. The Product Owner stopped
the pattern and asked for a root-cause fix.

**Fix (D-297):** the guards now use `pg_trigger_depth()` to distinguish *who* is
writing rather than *what* is written. Referential actions run at depth > 1;
direct statements are always depth 1. Forgery is refused for every column,
present and future, while referential integrity is never obstructed — including
foreign keys added later, which require no change to these functions.

**Also (D-299):** `stock_movements.variant_id` changed from CASCADE to SET NULL.
The ledger is an accounting record and must outlive the product it describes,
exactly as `order_items` does.

Proven afterwards: direct forgery of quantity, movement type and variant
reference all blocked; direct delete blocked; deleting a product with stock
history works; ledger rows survive with `variant_id = null` for audit.

### Why the test suite missed #4–#6

**Every test file ends in `ROLLBACK`, so nothing was ever deleted explicitly.**
210 assertions passed while three real bugs hid behind that gap. They appeared
during manual cleanup, not in any intentional test.

This is the clearest evidence in the project that static analysis and a green
test suite do not replace real execution.

**Corrective action:** deletion-path tests added to file 02 — deleting an order,
and deleting a product carrying stock history.

---

## 5. Configuration changes made during verification

| Change | Reason | Permanent? |
|---|---|---|
| Extensions pinned `with schema public` | Supabase may place extensions elsewhere, breaking `public.unaccent()` | ✅ in migration |
| `grant usage/execute on app.has_permission, app.current_admin_id to authenticated` | The dashboard needs these to hide unauthorised controls. They expose only the caller's own permissions (D-300) | ⚠️ **must be added to `0011_rls.sql`** |
| `grant usage on schema test` + harness functions `security definer` | The harness could not record results after dropping to `anon` | Test-only; removed at uninstall |

---

## 6. Not verified — stated plainly

### Concurrency (`SELECT … FOR UPDATE`)

**Status: NOT PROVEN.**

The two-session test produced correct final state — order A confirmed, order B
refused, `stock_on_hand = 0`, exactly one confirmation movement. But **session B
answered immediately rather than blocking**, which means session A had already
committed. The two never competed for a lock.

This proves the **stock check** works. It does **not** prove the **locking**
works.

The distinction matters: if two admins genuinely execute at the same instant
without locking, both read "available: 1", both pass the check, and stock goes
to −1. Only row locks prevent that.

**Cause:** the Supabase SQL Editor does not appear to hold an open transaction
across a `pg_sleep` in the way `psql` does.

**Required before launch:** re-run with `psql` or DBeaver, where transaction
control is explicit. Procedure documented in
`supabase/tests/05_concurrency_MANUAL.md`.

**Risk accepted for now** because there is no frontend, no admin using the
dashboard and no real orders. **This must not reach production unverified.**

### Also not covered in Phase 1

- Real Google Sheets I/O (Phase 9) — only the queue behaviour is proven
- Storage bucket policies (Phase 4) — no buckets exist yet
- Performance under load (Phase 10) — meaningless against empty tables
- Geography seed — still pending wilaya code confirmation

---

## 7. Outstanding items

| # | Item | Blocks |
|---|---|---|
| 1 | Add the two `app` grants to `0011_rls.sql` | Phase 3 |
| 2 | Concurrency re-test with `psql`/DBeaver | Launch |
| 3 | Wilaya codes confirmed with the delivery company | Geography seed |
| 4 | `order_submission_log` pruning job | Launch |
| 5 | Remove the test harness (`99_uninstall.sql`) | Whenever |

---

## 8. Assessment

The schema is sound. Every commercial rule that matters — stock timing, price
integrity, order snapshots, fraud controls, role isolation, anonymous access —
was executed against a real PostgreSQL 17 instance and behaved as specified.

The three schema defects shared one cause and are fixed at the root rather than
patched. The fix is general: it will not recur when new foreign keys are added.

One item is genuinely unverified and is recorded as such rather than assumed.

**Phase 1: Verified Complete**, subject to §6 and §7.
