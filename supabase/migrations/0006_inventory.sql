-- =============================================================================
-- 0006_inventory.sql
-- Stock as an append-only ledger (D-043). The ledger is the source of truth;
-- product_variants.stock_on_hand is a maintained cache.
--
-- Why a ledger and not a counter: returns, cancellations and manual corrections
-- all happen in this business, and "why is this size gone?" must be answerable.
-- =============================================================================

create table public.stock_movements (
  id            bigint generated always as identity primary key,
  -- SET NULL, not CASCADE. The ledger is an accounting record and must survive
  -- the deletion of the product it describes, exactly as order_items survives
  -- (D-057). CASCADE here made deleting any product with stock history
  -- impossible, because the append-only guard correctly refused the cascade.
  -- Found during Phase 1 verification.
  variant_id    uuid references public.product_variants (id) on delete set null,
  movement_type text not null check (movement_type in (
    'order_confirmed',    -- decrease
    'order_returned',     -- increase
    'order_cancelled',    -- increase (only after a confirmation)
    'restock',            -- increase
    'manual_correction',  -- either
    'initial'             -- opening balance
  )),
  -- Snapshot so a movement remains readable after its variant is deleted.
  quantity_delta integer not null check (quantity_delta <> 0),
  order_id       uuid,   -- FK added in 0007 once orders exist
  actor_id       uuid references public.admin_users (id) on delete set null,
  note           text,
  created_at     timestamptz not null default now()
);

create index stock_movements_variant_idx on public.stock_movements (variant_id, created_at desc);
create index stock_movements_order_idx   on public.stock_movements (order_id) where order_id is not null;
create index stock_movements_type_idx    on public.stock_movements (movement_type, created_at desc);

comment on table public.stock_movements is
  'Append-only stock ledger. Never UPDATE or DELETE — post a compensating row.';

-- -----------------------------------------------------------------------------
-- Movement types are a CHECK constraint, not a table, unlike order statuses.
--
-- Justification (D-283): order statuses need bilingual labels shown to admins
-- and drive a configurable workflow, so they are data. Movement types are
-- internal accounting categories with no UI labels and no configurability. A
-- lookup table would add a join to every stock query for no benefit.
-- -----------------------------------------------------------------------------

-- Keep the cached quantity in step with the ledger.
create or replace function app.apply_stock_movement()
returns trigger
language plpgsql
as $$
begin
  update public.product_variants
  set stock_on_hand = stock_on_hand + new.quantity_delta
  where id = new.variant_id;
  return new;
end;
$$;

create trigger stock_movements_apply
  after insert on public.stock_movements
  for each row execute function app.apply_stock_movement();

-- The ledger is append-only. Corrections are new rows, never edits.
--
-- ROOT-CAUSE DESIGN (Phase 1 verification).
--
-- An append-only guard must distinguish WHO is writing, not WHAT is written.
--
-- A human editing a figure and the database enforcing ON DELETE CASCADE /
-- SET NULL are both UPDATEs. Earlier attempts enumerated "allowed columns",
-- which broke again at the next foreign key: order_timeline cascade, then
-- stock_movements.order_id (SET NULL), then stock_movements.variant_id
-- (CASCADE). Three symptoms, one cause.
--
-- pg_trigger_depth() answers the real question. Referential actions run while
-- the database is already inside constraint enforcement, so depth > 1. A direct
-- statement from a user is always depth 1.
--
-- Result: forgery is refused for every column, present and future, while
-- referential integrity is never obstructed — including foreign keys added
-- later, which need no change to this function.

--
-- One narrow exception: stock_movements.order_id carries ON DELETE SET NULL,
-- and SET NULL is an UPDATE. A blanket UPDATE ban therefore made deleting an
-- order impossible — the cascade could not clear the reference. Found during
-- Phase 1 verification, after the same class of bug was found on order_timeline.
--
-- Clearing a reference to a row that no longer exists does not touch a single
-- accounting figure, so it is permitted. Everything that determines stock
-- levels stays frozen, including re-pointing a movement at a different order.
create or replace function app.forbid_ledger_mutation()
returns trigger
language plpgsql
as $$
begin
  if pg_trigger_depth() > 1 then
    return case tg_op when 'DELETE' then old else new end;
  end if;

  if tg_op = 'DELETE' then
    raise exception 'stock_movements is append-only; post a compensating movement instead'
      using errcode = 'restrict_violation';
  end if;

  raise exception 'stock_movements is append-only; corrections must be new rows'
    using errcode = 'restrict_violation';
end;
$$;

create trigger stock_movements_no_update
  before update or delete on public.stock_movements
  for each row execute function app.forbid_ledger_mutation();

-- -----------------------------------------------------------------------------
-- Reconciliation: the cache must always equal the sum of the ledger.
-- Exposed so the dashboard can prove integrity rather than assume it.
-- -----------------------------------------------------------------------------
create or replace function public.stock_reconciliation()
returns table (
  variant_id     uuid,
  sku            text,
  cached_stock   integer,
  ledger_stock   bigint,
  is_consistent  boolean
)
language sql
stable
as $$
  select
    v.id,
    v.sku,
    v.stock_on_hand,
    coalesce(sum(m.quantity_delta), 0) as ledger_stock,
    v.stock_on_hand = coalesce(sum(m.quantity_delta), 0)
  from public.product_variants v
  left join public.stock_movements m on m.variant_id = v.id
  group by v.id, v.sku, v.stock_on_hand
  -- Movements whose variant was deleted carry variant_id = null and are
  -- intentionally excluded: there is no live variant left to reconcile against.
  -- They remain in the table for audit.
$$;
