-- =============================================================================
-- 0003_identity.sql
-- Roles, permissions, admin users.
-- Supabase Auth is used for STAFF ONLY. The storefront is anonymous (D-115).
-- =============================================================================

create table public.roles (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique check (code ~ '^[a-z_]+$'),
  name_fr    text not null,
  name_ar    text not null,
  -- System roles cannot be deleted; a store must always retain a Super Admin.
  is_system  boolean not null default false,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.permissions (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique check (code ~ '^[a-z_]+\.[a-z_]+$'),
  -- Grouping is for dashboard presentation only.
  group_code  text not null,
  description text not null,
  created_at  timestamptz not null default now()
);

comment on table public.permissions is
  'Permissions are data. Adding a role is a row, never a deployment (D-114).';

create table public.role_permissions (
  role_id       uuid not null references public.roles (id) on delete cascade,
  permission_id uuid not null references public.permissions (id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (role_id, permission_id)
);

create index role_permissions_permission_idx on public.role_permissions (permission_id);

-- -----------------------------------------------------------------------------
-- ADMIN USERS
-- id is the auth.users id. One row per staff member.
-- -----------------------------------------------------------------------------
create table public.admin_users (
  id         uuid primary key references auth.users (id) on delete cascade,
  role_id    uuid not null references public.roles (id) on delete restrict,
  full_name  text not null,
  email      text not null,
  phone      text,
  is_active  boolean not null default true,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index admin_users_role_idx on public.admin_users (role_id);

-- -----------------------------------------------------------------------------
-- Guard: never leave the system without an active Super Admin.
--
-- Without this, an admin can lock everyone out of the dashboard with a single
-- careless edit and there is no recovery path through the UI.
-- -----------------------------------------------------------------------------
create or replace function app.guard_last_super_admin()
returns trigger
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_super_role uuid;
  v_remaining  int;
begin
  select id into v_super_role from public.roles where code = 'super_admin';
  if v_super_role is null then
    return coalesce(new, old);
  end if;

  -- Only act when this change removes a super admin
  if tg_op = 'DELETE' then
    if old.role_id is distinct from v_super_role or not old.is_active then
      return old;
    end if;
  else
    if not (old.role_id = v_super_role and old.is_active)
       or (new.role_id = v_super_role and new.is_active) then
      return new;
    end if;
  end if;

  select count(*) into v_remaining
  from public.admin_users
  where role_id = v_super_role
    and is_active
    and id <> old.id;

  if v_remaining = 0 then
    raise exception 'Cannot remove the last active Super Admin'
      using errcode = 'restrict_violation';
  end if;

  return coalesce(new, old);
end;
$$;

create trigger admin_users_guard_super_admin
  before update or delete on public.admin_users
  for each row execute function app.guard_last_super_admin();

create trigger roles_set_updated_at       before update on public.roles       for each row execute function app.set_updated_at();
create trigger admin_users_set_updated_at before update on public.admin_users for each row execute function app.set_updated_at();

select app.attach_audit('public.roles');
select app.attach_audit('public.role_permissions');
select app.attach_audit('public.admin_users');

-- =============================================================================
-- Identity helpers
--
-- current_admin_id() returns the admin_users row id for the caller, or null.
-- has_permission()   is the single authority for authorisation (D-114).
--                    No `if role = 'admin'` checks anywhere in the codebase.
-- =============================================================================
create or replace function app.current_admin_id()
returns uuid
language sql
stable
security definer
set search_path = public, app
as $$
  select au.id
  from public.admin_users au
  where au.id = auth.uid()
    and au.is_active
$$;

create or replace function app.has_permission(p_code text)
returns boolean
language sql
stable
security definer
set search_path = public, app
as $$
  select exists (
    select 1
    from public.admin_users au
    join public.role_permissions rp on rp.role_id = au.role_id
    join public.permissions p       on p.id = rp.permission_id
    where au.id = auth.uid()
      and au.is_active
      and p.code = p_code
  )
$$;

comment on function app.has_permission(text) is
  'Single source of authorisation truth. Permissions are data (D-114).';
