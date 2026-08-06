-- =============================================================================
-- 0012_auth_helpers.sql — Phase 3
--
-- The dashboard must know what the signed-in admin may do, so it can hide
-- controls they cannot use. Reading role_permissions directly is correctly
-- blocked for anyone without roles.manage, so these SECURITY DEFINER functions
-- answer the narrower question: "what may *I* do?"
--
-- Both report only on the caller. Neither can be used to inspect anyone else.
--
-- Why permissions and not the role code: hard-coding `role === 'super_admin'`
-- in the UI would mean a code change and a deploy the day a content manager is
-- hired. Permissions make that a database row (D-114).
-- =============================================================================

create or replace function public.my_permissions()
returns text[]
language sql
stable
security definer
set search_path = public, app
as $$
  select coalesce(array_agg(p.code order by p.code), '{}')
  from public.admin_users au
  join public.role_permissions rp on rp.role_id = au.role_id
  join public.permissions p       on p.id = rp.permission_id
  where au.id = auth.uid()
    and au.is_active
$$;

revoke all on function public.my_permissions() from public, anon;
grant execute on function public.my_permissions() to authenticated;

create or replace function public.my_profile()
returns jsonb
language sql
stable
security definer
set search_path = public, app
as $$
  select jsonb_build_object(
    'id', au.id,
    'full_name', au.full_name,
    'email', au.email,
    'is_active', au.is_active,
    'role_code', r.code,
    'role_name_fr', r.name_fr,
    'role_name_ar', r.name_ar
  )
  from public.admin_users au
  join public.roles r on r.id = au.role_id
  where au.id = auth.uid()
$$;

revoke all on function public.my_profile() from public, anon;
grant execute on function public.my_profile() to authenticated;

-- Touch last_seen_at so the owner can tell which staff accounts are dormant.
-- Deliberately cheap: no audit row, no timeline entry — a sign-in is not an
-- administrative action on the shop.
create or replace function public.touch_last_seen()
returns void
language sql
volatile
security definer
set search_path = public, app
as $$
  update public.admin_users
  set last_seen_at = now()
  where id = auth.uid() and is_active
$$;

revoke all on function public.touch_last_seen() from public, anon;
grant execute on function public.touch_last_seen() to authenticated;
