# Phase 1 — Execution Runbook

**You run these steps. I analyse the output and fix what fails.**

I have no network access, so I cannot create the project, apply migrations or run
a single assertion. Everything below is designed to take you about 20 minutes.

---

## Step 1 — Create the project

supabase.com → New Project.

- **Region: Frankfurt (eu-central-1)** — lowest latency to Algeria of the
  available regions. Region cannot be changed later.
- Save the database password somewhere safe.

Then run this and send me the result:

```sql
select version(), current_setting('server_version_num')::int as version_num;
```

If `version_num` is below `150000`, stop and tell me — the PG14 fallback
(`0005b`) is needed and I will confirm the exact swap before you continue.

---

## Step 2 — Apply everything

SQL Editor → paste **`dist/PHASE1_ALL.sql`** → Run.

That single file contains migrations 0001–0011 plus the system seed, in order.

**Send me:** success or the full error text, and the execution time shown.

If it errors, send the error and stop. Do not try to patch it — I need to see
what actually broke.

Sanity check:

```sql
select count(*) as tables from information_schema.tables
where table_schema = 'public' and table_type = 'BASE TABLE';
-- expected: 33

select count(*) as statuses from public.order_statuses;   -- expected: 12
select count(*) as roles    from public.roles;            -- expected: 3
select count(*) as perms    from public.permissions;      -- expected: 14
```

---

## Step 3 — Create three admin accounts

Authentication → Users → **Add user** (three times, any email and password).
Copy each UUID, then:

```sql
insert into public.admin_users (id, role_id, full_name, email) values
  ('<uuid-1>', (select id from public.roles where code='super_admin'),
   'Owner',   'owner@test.local'),
  ('<uuid-2>', (select id from public.roles where code='administrator'),
   'Staff',   'staff@test.local'),
  ('<uuid-3>', (select id from public.roles where code='content_manager'),
   'Content', 'content@test.local');

select au.full_name, r.code from public.admin_users au
join public.roles r on r.id = au.role_id;
```

Without all three, the role-isolation tests report **SKIPPED** rather than
passing — which is correct behaviour, but leaves the security question open.

---

## Step 4 — Install the harness

Run `supabase/tests/00_harness.sql`. This one commits.

---

## Step 5 — Run the four test files

One at a time, in order. Each ends with two result tables and rolls itself back.

| File | Expect |
|---|---|
| `01_structure_and_functions.sql` | ~45 assertions |
| `02_constraints_and_triggers.sql` | ~50 assertions |
| `03_order_lifecycle.sql` | ~55 assertions |
| `04_rls_security.sql` | ~60 assertions |

**Send me both result tables from each file — passes included.** A test that
passes for the wrong reason is only visible with the whole table in view.

If a file dies before printing its report, send the error message and the
statement it died on. That is more useful than a partial table.

---

## Step 6 — Concurrency (manual, two sessions)

Follow `supabase/tests/05_concurrency_MANUAL.md`.

This is the one test that cannot be automated: a single session does not compete
with itself for row locks. Two browser tabs work; two `psql` terminals are more
reliable.

Send me the result of Step 5 in that file — the four-row verification table.

---

## Step 7 — Cleanup

Only after I have confirmed the results:

```
supabase/tests/99_uninstall.sql
```

---

## What I need back

1. PostgreSQL version
2. Migration result + execution time
3. The four counts from Step 2
4. All eight result tables from Step 5
5. The concurrency verification table from Step 6
6. Anything unexpected — warnings, slow queries, odd notices

Then I write the **Phase 1 Verification Report**: what was tested, what passed,
what failed, what I fixed, and what remains unverifiable.

---

## Honest expectation

Roughly 210 assertions have never been executed. **I expect some to fail.**
Likely candidates, in order:

1. `set local role` behaviour inside the Supabase SQL Editor — role switching may
   not work exactly as it does in `psql`. If the RLS tests behave strangely, that
   is the first suspect.
2. `request.jwt.claims` impersonation — `auth.uid()` may not resolve from
   `set_config` in every context.
3. Error message wording in `expect_error` assertions — I matched on substrings
   like `'duplicate'`, and PostgreSQL's exact phrasing may differ.

A failure in category 3 is a test bug, not a schema bug. I will tell you which is
which rather than treating every red line as a crisis.
