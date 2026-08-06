-- =============================================================================
-- 0001_foundation.sql
-- Extensions, shared helpers, audit infrastructure.
-- Project: YAKOUB BIG BOSS
-- Baseline: PostgreSQL 15+  (see SPECIFICATION.md §28 C-03 Fallback Strategy)
-- =============================================================================

-- WITH SCHEMA public is deliberate, not decorative.
--
-- Supabase installs some extensions into an `extensions` schema. If unaccent
-- landed there, every call to public.unaccent() in app.slugify() would fail at
-- runtime, and the gin_trgm_ops operator class would not resolve when the
-- trigram indexes are created. Pinning the schema removes the ambiguity.
--
-- `if not exists` means these are no-ops if Supabase has already provided them.
create extension if not exists pgcrypto with schema public;   -- gen_random_uuid()
create extension if not exists unaccent with schema public;   -- slug / SKU transliteration
create extension if not exists pg_trgm  with schema public;   -- fuzzy commune + product search

-- Fail fast and loudly if unaccent is not callable as public.unaccent(text),
-- rather than discovering it when the first product slug is generated.
--
-- NOTE: to_regprocedure with an explicit signature, NOT to_regproc.
-- unaccent has two overloads — unaccent(text) and unaccent(regdictionary, text)
-- — and to_regproc() returns NULL for an ambiguous name, which would make this
-- guard fire even when the function is perfectly available.
do $$
declare
  v_schema text;
begin
  if to_regprocedure('public.unaccent(text)') is null then
    select n.nspname into v_schema
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where p.proname = 'unaccent' and pg_get_function_arguments(p.oid) = 'text'
    limit 1;

    raise exception
      'public.unaccent(text) is not available. Found in schema: %. Resolve before continuing.',
      coalesce(v_schema, 'nowhere — extension not installed');
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Schemas
-- app  : internal helper functions, never exposed through PostgREST
-- -----------------------------------------------------------------------------
create schema if not exists app;
revoke all on schema app from anon, authenticated;

-- =============================================================================
-- updated_at maintenance
-- =============================================================================
create or replace function app.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =============================================================================
-- Identity helpers live in 0003_identity.sql, NOT here.
--
-- They are `language sql`, and PostgreSQL validates SQL function bodies at
-- CREATE time (unlike plpgsql, which is only checked when called). Since they
-- read admin_users, role_permissions and permissions, they cannot be created
-- before those tables exist.
--
-- Moving them is the correct fix. Suppressing the check with
-- `set check_function_bodies = off` would hide a real dependency.
-- =============================================================================

-- =============================================================================
-- Text helpers
-- =============================================================================

-- Slugify: lowercase, transliterate accents, collapse non-alphanumerics.
-- Arabic input yields an empty result, so callers must fall back to the French
-- slug (D-139 / spec §17: Arabic slugs are transliterated, never percent-encoded).
create or replace function app.slugify(p_text text)
returns text
language sql
immutable
as $$
  select trim(both '-' from
    regexp_replace(
      lower(public.unaccent(coalesce(p_text, ''))),
      '[^a-z0-9]+', '-', 'g'
    )
  )
$$;

-- ---------------------------------------------------------------------------
-- Algerian phone normalisation (C-07a / D-268)
--
-- Accepts   0XXXXXXXXX | +213XXXXXXXXX | 00213XXXXXXXXX  with any spacing.
-- Returns   +213XXXXXXXXX  (E.164), or null when the input is not valid.
--
-- CONFIGURABLE (D-292). The accepted mobile prefixes, the country code and the
-- national number length are read from `settings`, so the owner can adapt the
-- rule from the dashboard without a deployment.
--
-- This is a deliberate exception to D-283 ("do not build for hypothetical
-- requirements"): Algerian operators add mobile prefixes periodically, which is
-- a recurring real event rather than a speculative one, and the cost is a
-- single settings row.
--
-- CONSEQUENCE: reading settings makes this function STABLE, not IMMUTABLE. It
-- therefore cannot be used inside an index or a generated column. It is not
-- used in either today.
--
-- Returning null rather than raising lets callers decide: the checkout rejects
-- it, an import can quarantine the row.
-- ---------------------------------------------------------------------------
create or replace function app.normalize_phone_dz(p_phone text)
returns text
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_digits   text;
  v_country  text;
  v_length   int;
  v_prefixes text[];
  v_pattern  text;
begin
  if p_phone is null then
    return null;
  end if;

  -- Defaults match Algerian mobile numbering. Used when a setting is absent, so
  -- a missing or malformed row can never disable validation entirely.
  select coalesce(value #>> '{}', '213') into v_country
    from public.settings where key = 'phone.country_code';
  v_country := coalesce(v_country, '213');

  select coalesce((value #>> '{}')::int, 9) into v_length
    from public.settings where key = 'phone.national_length';
  v_length := coalesce(v_length, 9);

  select array(select jsonb_array_elements_text(value)) into v_prefixes
    from public.settings where key = 'phone.mobile_prefixes';
  if v_prefixes is null or cardinality(v_prefixes) = 0 then
    v_prefixes := array['5','6','7'];
  end if;

  v_digits := regexp_replace(p_phone, '[^0-9+]', '', 'g');
  v_digits := regexp_replace(v_digits, '^\+', '00');   -- +213… -> 00213…

  if v_digits ~ ('^00' || v_country || '[0-9]{' || v_length || '}$') then
    v_digits := substring(v_digits from length(v_country) + 3);
  elsif v_digits ~ ('^0[0-9]{' || v_length || '}$') then
    v_digits := substring(v_digits from 2);
  else
    return null;
  end if;

  -- Mobile only. A landline in a COD order is an undeliverable order: the
  -- courier must be able to reach the customer on the road.
  v_pattern := '^(' || array_to_string(v_prefixes, '|') || ')[0-9]{' || (v_length - 1) || '}$';
  if v_digits !~ v_pattern then
    return null;
  end if;

  return '+' || v_country || v_digits;
end;
$$;

comment on function app.normalize_phone_dz(text) is
  'Canonical E.164 form for matching, blocklist and duplicate detection (D-268). Rules configurable via settings (D-292).';

-- =============================================================================
-- Audit log (D-116)
-- Every administrative write is recorded. Append-only.
-- =============================================================================
create table public.audit_log (
  id           bigint generated always as identity primary key,
  actor_id     uuid,
  action       text not null check (action in ('insert','update','delete')),
  entity_table text not null,
  entity_id    text,
  before       jsonb,
  after        jsonb,
  created_at   timestamptz not null default now()
);

create index audit_log_entity_idx  on public.audit_log (entity_table, entity_id);
create index audit_log_actor_idx   on public.audit_log (actor_id, created_at desc);
create index audit_log_created_idx on public.audit_log (created_at desc);

create or replace function app.audit_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_actor uuid := auth.uid();
  v_id    text;
begin
  if tg_op = 'DELETE' then
    v_id := (to_jsonb(old) ->> 'id');
    insert into public.audit_log (actor_id, action, entity_table, entity_id, before)
    values (v_actor, 'delete', tg_table_name, v_id, to_jsonb(old));
    return old;
  elsif tg_op = 'UPDATE' then
    v_id := (to_jsonb(new) ->> 'id');
    -- Skip no-op updates so the log stays readable
    if to_jsonb(old) is distinct from to_jsonb(new) then
      insert into public.audit_log (actor_id, action, entity_table, entity_id, before, after)
      values (v_actor, 'update', tg_table_name, v_id, to_jsonb(old), to_jsonb(new));
    end if;
    return new;
  else
    v_id := (to_jsonb(new) ->> 'id');
    insert into public.audit_log (actor_id, action, entity_table, entity_id, after)
    values (v_actor, 'insert', tg_table_name, v_id, to_jsonb(new));
    return new;
  end if;
end;
$$;

-- Convenience: attach the audit trigger to a table.
create or replace function app.attach_audit(p_table regclass)
returns void
language plpgsql
as $$
begin
  execute format(
    'create trigger %I after insert or update or delete on %s
       for each row execute function app.audit_trigger()',
    'audit_' || replace(p_table::text, 'public.', ''), p_table
  );
end;
$$;
