# Operations Runbook

Everything that must be true before real customer orders exist, and what to do
when something breaks afterwards.

---

## 1. Backups — decide this before launch, not after

Supabase's automatic backups depend on your plan. On the free tier retention is
short and point-in-time recovery is unavailable.

**This matters more than usual here.** There is no payment processor holding a
parallel record of your orders. If the database is lost, the orders are lost —
the only other copy is the Google Sheet, and that mirror only contains
*confirmed* orders.

### Minimum before launch

| Task | Frequency |
|---|---|
| Confirm your plan's retention in Supabase → Database → Backups | Once |
| Take a manual backup before every migration | Every deploy |
| **Perform one full restore into a scratch project** | Before launch, then twice a year |

The restore rehearsal is the part people skip. A backup nobody has restored is a
hypothesis, not a backup.

### Manual export

```bash
supabase db dump --linked -f backup-$(date +%F).sql
```

Store it off Supabase. A backup living only inside the thing it protects is not
a backup.

---

## 2. Pre-deploy security check

Run this in the SQL Editor before every release:

```sql
select * from public.security_audit;
```

**Zero rows is the only acceptable result.** Any `critical` finding blocks the
release — no exceptions, no "we'll fix it after launch".

The five checks it performs:

| Finding | Meaning |
|---|---|
| `rls_disabled` | A table readable by anyone holding the anon key, which is published in the frontend bundle |
| `anon_policy_on_sensitive` | A policy exposing orders, customers, admins or the audit log |
| `rls_without_policy` | RLS on with no policy — denies everything, usually a mistake |
| `definer_without_search_path` | Classic privilege-escalation route in a `SECURITY DEFINER` function |
| `anon_executable_function` | An internal `app.*` function callable by the public |

The same view is visible in the dashboard under **Sécurité** for anyone holding
`audit.view`.

---

## 3. Scheduled maintenance

Neither of these is urgent, and both become urgent if ignored for a year.

```sql
-- Submission log: rate limits use a one-hour window; 30 days is kept so a
-- fraud pattern can still be investigated after the fact.
select public.prune_submission_log(30);

-- Sheets queue: rows already written to the spreadsheet.
select public.prune_sheets_queue(90);
```

Schedule monthly via Supabase → Database → Cron, or run them by hand.

---

## 4. Concurrency test — still outstanding

**This is the one item from Phase 1 that remains unverified.**

The two-session test produced the correct final state, but session B answered
immediately instead of blocking — meaning the two never actually competed for a
row lock. That proves the **stock check** works. It does **not** prove the
**locking** works.

The difference is real: without locks, two admins confirming at the same instant
both read "available: 1", both pass the check, and stock goes to −1.

**Must be re-run with `psql` or DBeaver before launch**, where transaction
control is explicit. The procedure is in
`supabase/tests/05_concurrency_MANUAL.md`.

Accepted risk while there is no frontend and no real orders. **Not acceptable in
production.**

---

## 5. Incident: customer data may be exposed

1. Run `select * from public.security_audit;`
2. If a policy grants `anon` on a sensitive table, drop it immediately:
   ```sql
   drop policy "<name>" on public.<table>;
   ```
3. Check `audit_log` for what was touched and by whom
4. Rotate the anon key: Supabase → Settings → API → Roll
5. Redeploy with the new key in `VITE_SUPABASE_ANON_KEY`

---

## 6. Incident: Google Sheets has stopped syncing

Confirmations are **never** blocked by this — the queue absorbs the failure
entirely (D-155). Orders continue normally.

1. Dashboard → **Google Sheets** panel, read the last error
2. Common causes: service-account key expired · sheet renamed or unshared ·
   `GOOGLE_SHEET_ID` changed
3. Fix the cause, then press **Resynchroniser** on the affected rows

Rows stop retrying after 5 attempts by design — an infinite retry against a
permanently broken credential is just noise.

---

## 7. Incident: a wave of fake orders

The reason this matters: there is no payment step, so the order form has no
natural fraud filter.

1. Dashboard → **Sécurité** → suspicious numbers
2. Mark the orders `fake` — this blocklists the phone automatically (D-062)
3. If the wave comes from one network, tighten the IP limit in
   `place_order` (currently 10/hour per IP, 3/hour per phone)
4. Stock was never at risk: it only moves on confirmation (D-040), which is why
   that rule exists

---

## 8. Key handling

| Key | Where it may appear |
|---|---|
| `anon` / publishable | Browser bundle. Public by design; RLS is the protection |
| `service_role` | **Netlify environment variables only.** Never in `src/`, never in a chat, never in a screenshot |

`service_role` bypasses every policy verified in Phase 1. If it leaks, every
customer record is readable regardless of how correct the RLS model is.

The CI pipeline fails the build if `service_role` appears anywhere in `dist/`.

---

## 9. Before going live

- [ ] Concurrency test passed with `psql` (§4)
- [ ] `security_audit` returns zero rows
- [ ] One full backup restore rehearsed
- [ ] Delivery prices set for all 58 wilayas
- [ ] Legal pages written and published
- [ ] Business email and opening hours filled in
- [ ] Test harness removed (`supabase/tests/99_uninstall.sql`)
- [ ] Test admin passwords changed
- [ ] `Confirm email` re-enabled in Supabase Auth
- [ ] Real domain set in `SITE_URL` and `VITE_SITE_URL`
- [ ] Google service account connected and one order synced end to end
- [ ] Fonts installed in `public/fonts` (`docs/FONTS.md`)
