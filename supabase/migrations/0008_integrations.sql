-- =============================================================================
-- 0008_integrations.sql
-- Google Sheets sync queue (D-155) and debounced Netlify rebuilds (D-252).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- GOOGLE SHEETS SYNC QUEUE
--
-- Confirmation enqueues; a Netlify Function drains. If Sheets is unreachable or
-- the token has expired, nothing is lost and the admin's confirmation is never
-- blocked (D-155). One sheet, all orders (D-152).
-- -----------------------------------------------------------------------------
create table public.sheets_sync_queue (
  id           bigint generated always as identity primary key,
  order_id     uuid not null references public.orders (id) on delete cascade,
  status       text not null default 'pending'
                 check (status in ('pending','processing','done','failed')),
  attempts     smallint not null default 0 check (attempts >= 0),
  last_error   text,
  payload      jsonb not null,
  locked_at    timestamptz,
  processed_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- One live queue entry per order. A re-sync resets the existing row rather than
-- creating a duplicate line in the spreadsheet.
create unique index sheets_sync_queue_order_key on public.sheets_sync_queue (order_id);

create index sheets_sync_queue_pending_idx
  on public.sheets_sync_queue (status, created_at)
  where status in ('pending','failed');

comment on table public.sheets_sync_queue is
  'One-way mirror: database -> Sheets. Edits made in Sheets never flow back (D-154).';

-- Claim a batch atomically. FOR UPDATE SKIP LOCKED lets several function
-- invocations run concurrently without processing the same row twice.
create or replace function public.claim_sheets_sync_batch(p_limit int default 20)
returns setof public.sheets_sync_queue
language plpgsql
security definer
set search_path = public, app
as $$
begin
  return query
  with claimed as (
    select id from public.sheets_sync_queue
    where status in ('pending','failed')
      and attempts < 5
      and (locked_at is null or locked_at < now() - interval '5 minutes')
    order by created_at
    limit p_limit
    for update skip locked
  )
  update public.sheets_sync_queue q
  set status = 'processing',
      locked_at = now(),
      attempts = q.attempts + 1
  from claimed
  where q.id = claimed.id
  returning q.*;
end;
$$;

revoke all on function public.claim_sheets_sync_batch(int) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- BUILD REQUESTS  (C-02 / D-251, D-252, D-253)
--
-- CMS publishing inserts a request; a debounced worker triggers one Netlify
-- build for a burst of edits instead of one build per keystroke.
-- -----------------------------------------------------------------------------
create table public.build_requests (
  id           bigint generated always as identity primary key,
  reason       text not null,
  requested_by uuid references public.admin_users (id) on delete set null,
  status       text not null default 'pending'
                 check (status in ('pending','triggered','failed','superseded')),
  triggered_at timestamptz,
  error        text,
  created_at   timestamptz not null default now()
);

create index build_requests_pending_idx on public.build_requests (status, created_at)
  where status = 'pending';

create trigger sheets_sync_queue_set_updated_at
  before update on public.sheets_sync_queue
  for each row execute function app.set_updated_at();
