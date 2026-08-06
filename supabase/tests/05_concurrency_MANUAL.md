# 05 — Concurrency Test (MANUAL)

**This test cannot be automated in a single SQL session.**

A session does not compete with itself for row locks, so running both halves in
one connection proves nothing. Two genuinely concurrent connections are required.
This is stated plainly rather than faked, per the working rules.

**What is being proved:** two administrators confirming the last unit at the same
moment cannot both succeed (C-04 / D-261, D-262 · resolves C-07g).

---

## Setup

Two separate SQL sessions. Either:

- **Option A** — two browser tabs on the Supabase SQL Editor, or
- **Option B** — two `psql` terminals (preferred; transaction control is explicit)

```
psql "postgresql://postgres:[PASSWORD]@db.[PROJECT].supabase.co:5432/postgres"
```

> The Supabase SQL Editor may not hold an open transaction between separate
> "Run" clicks. If step 3 in Session A does not appear to block, use Option B.

---

## Step 1 — Fixture (Session A, committed)

Run once. This one is **not** rolled back, because both sessions must see it.

```sql
-- Creates a product with exactly ONE unit in stock, and two orders for it.
do $$
declare
  v_w uuid; v_c uuid; v_bureau uuid; v_p uuid; v_col uuid;
  v_m uuid; v_pm uuid; v_v uuid; v_code smallint := 58; v_res jsonb;
begin
  while exists (select 1 from public.wilayas where code = v_code) and v_code > 1 loop
    v_code := v_code - 1;
  end loop;

  insert into public.wilayas (code, name_fr, name_ar)
  values (v_code, 'ZZCONC Wilaya', 'ولاية تزامن') returning id into v_w;
  insert into public.communes (wilaya_id, name_fr, name_ar)
  values (v_w, 'ZZCONC Commune', 'بلدية تزامن') returning id into v_c;

  select id into v_bureau from public.delivery_methods where code = 'bureau';
  insert into public.delivery_prices (wilaya_id, delivery_method_id, price)
  values (v_w, v_bureau, 400);

  insert into public.colors (name_fr, hex_value) values ('ZZCONC Noir','#000000')
  returning id into v_col;
  insert into public.products (slug, name_fr, original_price)
  values ('zzconc-product','ZZCONC Product', 3000) returning id into v_p;
  insert into public.media (storage_path, mime_type)
  values ('zzconc/img.webp','image/webp') returning id into v_m;
  insert into public.product_media (product_id, media_id) values (v_p, v_m) returning id into v_pm;
  insert into public.product_variants (product_id, color_id) values (v_p, v_col) returning id into v_v;
  update public.products set is_published = true where id = v_p;

  -- EXACTLY ONE UNIT
  insert into public.stock_movements (variant_id, movement_type, quantity_delta, note)
  values (v_v, 'initial', 1, 'ZZCONC single unit');

  -- Two separate customers, each ordering that one unit.
  v_res := public.place_order('Conc','One','0561000001', v_w, v_c, v_bureau, null, null,
             jsonb_build_array(jsonb_build_object('variant_id', v_v, 'quantity', 1)));
  raise notice 'ORDER A reference: %', v_res->>'reference';

  -- The duplicate guard is per phone, so use a different number.
  v_res := public.place_order('Conc','Two','0561000002', v_w, v_c, v_bureau, null, null,
             jsonb_build_array(jsonb_build_object('variant_id', v_v, 'quantity', 1)));
  raise notice 'ORDER B reference: %', v_res->>'reference';
end $$;

select o.reference, o.first_name, o.id
from public.orders o
where o.phone_e164 in ('+213561000001','+213561000002')
order by o.created_at;
```

Note both order ids. Confirm stock is exactly 1:

```sql
select sku, stock_on_hand from public.product_variants
where product_id = (select id from public.products where slug = 'zzconc-product');
```

---

## Step 2 — Session A: open a transaction and confirm order A, but DO NOT COMMIT

```sql
begin;
select set_config('request.jwt.claims',
  json_build_object('sub', (select au.id from public.admin_users au
    join public.roles r on r.id = au.role_id
    where r.code = 'super_admin' and au.is_active limit 1))::text, true);

select public.confirm_order('<ORDER_A_ID>'::uuid, 'session A');
-- Expected: {"ok": true, "oversold": false}
-- LEAVE THIS TRANSACTION OPEN.
```

---

## Step 3 — Session B: confirm order B **while A is still open**

```sql
begin;
select set_config('request.jwt.claims',
  json_build_object('sub', (select au.id from public.admin_users au
    join public.roles r on r.id = au.role_id
    where r.code = 'super_admin' and au.is_active limit 1))::text, true);

select public.confirm_order('<ORDER_B_ID>'::uuid, 'session B');
```

### ✅ Expected behaviour

Session B **blocks**. It does not return. It is waiting on the row lock that
Session A holds on the variant.

This is the whole point: without `SELECT … FOR UPDATE`, Session B would read a
stale `stock_on_hand = 1`, pass its check, and both orders would be confirmed
against one unit.

While B is blocked, you can verify the wait from a third session:

```sql
select pid, state, wait_event_type, wait_event, left(query, 60)
from pg_stat_activity where state <> 'idle' and query ilike '%confirm_order%';
```

---

## Step 4 — Session A: commit

```sql
commit;
```

### ✅ Expected behaviour

Session B now unblocks and returns:

```json
{"ok": false, "reason": "insufficient_stock",
 "lines": [{"sku": "...", "requested": 1, "available": 0}]}
```

Then in Session B:

```sql
rollback;
```

---

## Step 5 — Verify the outcome

```sql
select o.reference, o.first_name, st.code as status, o.confirmed_at
from public.orders o join public.order_statuses st on st.id = o.status_id
where o.phone_e164 in ('+213561000001','+213561000002')
order by o.created_at;

select sku, stock_on_hand from public.product_variants
where product_id = (select id from public.products where slug = 'zzconc-product');

select count(*) as confirmation_movements
from public.stock_movements
where movement_type = 'order_confirmed'
  and variant_id = (select id from public.product_variants
                    where product_id = (select id from public.products where slug='zzconc-product'));
```

| Check | Required result |
|---|---|
| Order A status | `confirmed` |
| Order B status | `new` (unchanged) |
| `stock_on_hand` | **0** — never negative |
| Confirmation movements | exactly **1** |

### ❌ Failure signatures

- **Both orders confirmed** → locking is not working. Report immediately; this is
  a correctness bug, not a tuning issue.
- **`stock_on_hand = -1`** → the stock check is being bypassed.
- **Two confirmation movements** → the ledger is being written outside the lock.
- **Session B returns instantly with `ok: true`** → `FOR UPDATE` is missing or
  the two sessions are not actually concurrent (check Option B).
- **Deadlock error** → report it. Lock ordering is meant to prevent this; the
  order is locked first, then variants ordered by `variant_id`.

---

## Step 6 — Cleanup

```sql
delete from public.orders where phone_e164 in ('+213561000001','+213561000002');
delete from public.products where slug = 'zzconc-product';
delete from public.colors  where name_fr = 'ZZCONC Noir';
delete from public.media   where storage_path = 'zzconc/img.webp';
delete from public.communes where name_fr = 'ZZCONC Commune';
delete from public.wilayas  where name_fr = 'ZZCONC Wilaya';
```

> `products` cascades to `product_media` and `product_variants`; the variant
> cascade removes its stock movements. If a delete is blocked by a foreign key,
> report the message — it means a cascade rule is wrong.

---

## Optional: oversell override under contention

Repeat steps 2–4, but in Session B use:

```sql
select public.confirm_order('<ORDER_B_ID>'::uuid, 'owner approved oversell', true);
```

Expected: succeeds, `stock_on_hand` becomes `-1`, and an `oversell_override`
row appears in `order_timeline`. This proves the escape hatch works **and** that
it is recorded — an oversell must never be invisible.
