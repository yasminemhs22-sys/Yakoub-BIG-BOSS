# Phase 1 Verification — Test Suite

**Status of Phase 1: `Code Complete`, not `Verified Complete`.**

I have no network access and no PostgreSQL in my environment, so I cannot run
these against your project. **You run them; I analyse the output and fix what
fails.** Nothing is marked verified until real output says so.

---

## Before you start

Apply the migrations in order, then the system seed:

```
supabase/migrations/0001_foundation.sql
supabase/migrations/0002_geography_delivery.sql
supabase/migrations/0003_identity.sql
supabase/migrations/0004_cms.sql
supabase/migrations/0005_catalogue.sql
supabase/migrations/0006_inventory.sql
supabase/migrations/0007_orders.sql
supabase/migrations/0008_integrations.sql
supabase/migrations/0009_functions.sql
supabase/migrations/0010_place_order.sql
supabase/migrations/0011_rls.sql
supabase/seed/0001_system_data.sql
```

**Do not run** `0005b_variant_uniqueness_pg14_fallback.sql` unless test 01 reports
PostgreSQL 14 or earlier.

**Do not run** `seed/0002_geography.PENDING.sql`. It will refuse to execute.

### Admin accounts

Some tests need real admin accounts. Create the auth users through
**Authentication → Users** in the Supabase dashboard, then link them:

```sql
insert into public.admin_users (id, role_id, full_name, email)
values
  ('<uuid-1>', (select id from public.roles where code = 'super_admin'),
   'Owner', 'owner@example.com'),
  ('<uuid-2>', (select id from public.roles where code = 'administrator'),
   'Staff', 'staff@example.com'),
  ('<uuid-3>', (select id from public.roles where code = 'content_manager'),
   'Content', 'content@example.com');
```

Tests that need an account you have not created are reported as **SKIPPED**, with
the reason. They are never silently passed.

---

## Run order

| # | File | Transaction | Needs admins |
|---|---|---|---|
| 00 | `00_harness.sql` | **commits** | no |
| 01 | `01_structure_and_functions.sql` | rolls back | no |
| 02 | `02_constraints_and_triggers.sql` | rolls back | no |
| 03 | `03_order_lifecycle.sql` | rolls back | Super Admin |
| 04 | `04_rls_security.sql` | rolls back | all three |
| 05 | `05_concurrency_MANUAL.md` | manual | Super Admin |
| 99 | `99_uninstall.sql` | commits | no |

Files 01–04 each end with `ROLLBACK`. They leave **nothing** behind — no test
products, no test orders, no test wilayas. Safe to run against a project that
already holds real data, though running them before go-live is still wiser.

Every fixture is prefixed `ZZTEST` (or `ZZCONC` for the manual test), so if a run
is ever interrupted before rollback the residue is unmistakable.

---

## Reading the output

Each file ends with two result sets:

```
suite            | name                                   | result | detail
04-lifecycle     | placing an order does NOT reserve stock | PASS   |
05-confirmation  | stock decremented by the ordered qty    | FAIL   | expected 3, got 5
```

```
suite            | passed | failed | total
```

**Send me the full output of both result sets from each file**, including the
passes. A test that passes for the wrong reason is easier to spot with the whole
table in view.

If a file errors out before reaching the report, send the error message and the
statement it died on — that is more useful than the partial table.

---

## What is covered

| Requirement | Where |
|---|---|
| Migrations apply cleanly | 01 (structure + RLS coverage) |
| Functions and triggers behave | 01, 02 |
| RLS with anon and each role | 04 |
| Concurrency / no overselling | 05 (manual) |
| Full lifecycle incl. return | 03 |
| Sheets failure never blocks confirmation | 03, suite 07 |
| Constraints and indexes | 01, 02 |

Roughly 120 assertions.

---

## Known gaps — stated, not hidden

1. **Concurrency cannot be automated here.** One session does not contend with
   itself. File 05 is a manual two-session procedure.
2. **Real Google Sheets I/O is not tested.** These tests prove the *queue*
   behaves — that a failure leaves the confirmation intact and the row retryable.
   Actual Sheets calls belong to Phase 9.
3. **Storage policies are not covered.** No buckets exist yet; that is Phase 4.
4. **Performance is not measured.** With empty tables the numbers would be
   meaningless. Load testing belongs to Phase 10.
5. **`auth.users` interaction is only partially exercised.** Creating auth users
   is done through the dashboard, so the FK is proven but the signup flow is not.
6. **Geography seeding is untested** because it is still pending wilaya code
   confirmation. Tests build their own temporary wilaya instead.
