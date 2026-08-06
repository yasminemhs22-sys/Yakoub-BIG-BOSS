-- =============================================================================
-- PHASE 7 — run in the Supabase SQL Editor.
--
-- resolve_delivery_fee() already exists from Phase 1, but it was never granted
-- to anon. The checkout must be able to show the fee BEFORE an order exists,
-- and it must be the SAME function place_order() uses — otherwise the figure
-- shown and the figure charged could drift apart.
--
-- It reads only delivery_prices, which anon can already read.
-- =============================================================================

grant execute on function public.resolve_delivery_fee(uuid, uuid, uuid) to anon, authenticated;

select 'phase 7 ready' as status;
