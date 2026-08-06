-- =============================================================================
-- 0016_hardening.sql — Phase 11
--
-- Operational safety: pruning, fraud tooling, and a way to PROVE the security
-- model rather than assume it.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Pruning the submission log.
--
-- Every checkout attempt writes a row, including the rejected ones. Without a
-- prune this table grows forever and eventually slows the very rate-limit
-- lookups it exists to serve.
--
-- 30 days is well beyond the one-hour window the limits actually use; the extra
-- retention exists so a fraud pattern can still be investigated after the fact.
-- ---------------------------------------------------------------------------
create or replace function public.prune_submission_log(p_days int default 30)
returns integer
language plpgsql
volatile
security definer
set search_path = public, app
as $$
declare
  v_deleted integer;
begin
  delete from public.order_submission_log
  where created_at < now() - (p_days || ' days')::interval;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.prune_submission_log(int) from public, anon, authenticated;

-- Done queue rows are equally disposable once the spreadsheet has them.
create or replace function public.prune_sheets_queue(p_days int default 90)
returns integer
language plpgsql
volatile
security definer
set search_path = public, app
as $$
declare
  v_deleted integer;
begin
  delete from public.sheets_sync_queue
  where status = 'done' and processed_at < now() - (p_days || ' days')::interval;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.prune_sheets_queue(int) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Blocklist management.
--
-- Marking an order `fake` already blocks the number automatically (D-062).
-- These let the owner correct a mistake and add a number seen offline — a
-- caller who wastes deliveries is often known before they ever place an order.
-- ---------------------------------------------------------------------------
create or replace function public.block_phone(p_phone text, p_reason text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, app
as $$
declare
  v_e164 text;
begin
  if not app.has_permission('orders.update') then
    raise exception 'Not authorised' using errcode = 'insufficient_privilege';
  end if;

  v_e164 := app.normalize_phone_dz(p_phone);
  if v_e164 is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid_phone');
  end if;

  insert into public.phone_blocklist (phone_e164, reason, created_by)
  values (v_e164, p_reason, app.current_admin_id())
  on conflict (phone_e164) do update set reason = excluded.reason;

  return jsonb_build_object('ok', true, 'phone', v_e164);
end;
$$;

create or replace function public.unblock_phone(p_phone_e164 text)
returns void
language plpgsql
volatile
security definer
set search_path = public, app
as $$
begin
  if not app.has_permission('orders.update') then
    raise exception 'Not authorised' using errcode = 'insufficient_privilege';
  end if;
  delete from public.phone_blocklist where phone_e164 = p_phone_e164;
end;
$$;

revoke all on function public.block_phone(text, text) from public, anon;
revoke all on function public.unblock_phone(text) from public, anon;
grant execute on function public.block_phone(text, text) to authenticated;
grant execute on function public.unblock_phone(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Repeat offenders.
--
-- A number with several fake orders is a pattern, not an accident. Surfacing it
-- is more useful than blocking silently: the owner may recognise a competitor,
-- or a genuine customer whose orders keep failing for another reason.
-- ---------------------------------------------------------------------------
create or replace function public.suspicious_phones(p_min_fake int default 2)
returns table (phone_e164 text, fake_count bigint, total_orders bigint, is_blocked boolean)
language sql
stable
security definer
set search_path = public, app
as $$
  select o.phone_e164,
         count(*) filter (where st.code = 'fake'),
         count(*),
         exists (select 1 from public.phone_blocklist b where b.phone_e164 = o.phone_e164)
  from public.orders o
  join public.order_statuses st on st.id = o.status_id
  group by o.phone_e164
  having count(*) filter (where st.code = 'fake') >= p_min_fake
  order by 2 desc
$$;

revoke all on function public.suspicious_phones(int) from public, anon;
grant execute on function public.suspicious_phones(int) to authenticated;

-- ---------------------------------------------------------------------------
-- SECURITY AUDIT
--
-- The single most valuable object in this file.
--
-- Phase 1 proved the RLS model with 218 assertions, but a policy added later —
-- in a hurry, to fix something — could quietly expose customer data. This view
-- makes that visible in one query instead of a code review nobody performs.
--
-- Run it before every deploy. Any row is a finding.
-- ---------------------------------------------------------------------------
create or replace view public.security_audit as
-- 1. Tables without RLS: readable by anyone holding the anon key.
select 'rls_disabled' as finding,
       c.relname as object_name,
       'Table has no row level security' as detail,
       'critical' as severity
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity

union all

-- 2. Sensitive tables exposed to anon by any policy.
select 'anon_policy_on_sensitive',
       c.relname,
       'Policy "' || p.polname || '" grants the anon role',
       'critical'
from pg_policy p
join pg_class c on c.oid = p.polrelid
where c.relname in (
        'orders','order_items','order_timeline','phone_blocklist',
        'order_submission_log','audit_log','admin_users','stock_movements',
        'sheets_sync_queue','roles','permissions','role_permissions')
  and 'anon' = any (select rolname from pg_roles where oid = any (p.polroles))

union all

-- 3. RLS on, but no policy at all: denies everything. Safe, usually a mistake.
select 'rls_without_policy',
       c.relname,
       'RLS enabled but no policy defined',
       'warning'
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
  and not exists (select 1 from pg_policy p where p.polrelid = c.oid)
  and c.relname <> 'order_submission_log'

union all

-- 4. SECURITY DEFINER functions without a pinned search_path.
--    These run with the owner's rights; an unpinned search_path is the classic
--    privilege-escalation route.
select 'definer_without_search_path',
       p.proname,
       'SECURITY DEFINER without SET search_path',
       'critical'
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public','app')
  and p.prosecdef
  and (p.proconfig is null or not exists (
        select 1 from unnest(p.proconfig) cfg where cfg like 'search_path=%'))

union all

-- 5. Anything executable by anon that should not be.
select 'anon_executable_function',
       p.proname,
       'Function is executable by anon',
       'warning'
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'app'
  and has_function_privilege('anon', p.oid, 'execute');

comment on view public.security_audit is
  'Run before every deploy. Any row is a finding; "critical" blocks release.';

revoke all on public.security_audit from anon;
grant select on public.security_audit to authenticated;

select 'phase 11 hardening ready' as status;
