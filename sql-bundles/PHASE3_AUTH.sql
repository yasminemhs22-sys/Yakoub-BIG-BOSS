-- =============================================================================
-- PHASE 3 — run this in the Supabase SQL Editor.
-- Already applied if you ran the block I sent earlier; re-running is harmless
-- (create or replace).
-- =============================================================================

create or replace function public.my_permissions()
returns text[]
language sql stable security definer
set search_path = public, app
as $$
  select coalesce(array_agg(p.code order by p.code), '{}')
  from public.admin_users au
  join public.role_permissions rp on rp.role_id = au.role_id
  join public.permissions p       on p.id = rp.permission_id
  where au.id = auth.uid() and au.is_active
$$;

revoke all on function public.my_permissions() from public, anon;
grant execute on function public.my_permissions() to authenticated;

create or replace function public.my_profile()
returns jsonb
language sql stable security definer
set search_path = public, app
as $$
  select jsonb_build_object(
    'id', au.id, 'full_name', au.full_name, 'email', au.email,
    'is_active', au.is_active, 'role_code', r.code,
    'role_name_fr', r.name_fr, 'role_name_ar', r.name_ar)
  from public.admin_users au
  join public.roles r on r.id = au.role_id
  where au.id = auth.uid()
$$;

revoke all on function public.my_profile() from public, anon;
grant execute on function public.my_profile() to authenticated;

create or replace function public.touch_last_seen()
returns void
language sql volatile security definer
set search_path = public, app
as $$
  update public.admin_users set last_seen_at = now()
  where id = auth.uid() and is_active
$$;

revoke all on function public.touch_last_seen() from public, anon;
grant execute on function public.touch_last_seen() to authenticated;

select 'phase 3 auth functions ready' as status;
