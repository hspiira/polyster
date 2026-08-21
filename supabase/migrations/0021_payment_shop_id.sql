-- payments gains shop_id.
--
-- A payment was only reachable through its order, so reading a shop's payments
-- meant reading every payment on the device and filtering. That does not scale
-- and it cannot scope a sync payload, which is what this is for.
--
-- Denormalised on purpose: an order never changes shop, so the copy cannot
-- drift. The device does the same (Dexie schema v2).

alter table payments
  add column shop_id text references shops(id) on delete cascade;

update payments p
  set shop_id = o.shop_id
  from orders o
  where o.id = p.order_id
    and p.shop_id is null;

-- Only after the backfill: a not-null added first would reject every existing row.
alter table payments
  alter column shop_id set not null;

create index idx_payments_shop_id on payments(shop_id);

-- RLS matched through orders before, which meant a join per row. Now direct.
drop policy if exists "shop scoped via order" on payments;
create policy "shop scoped" on payments
  for all
  using (shop_id = current_shop_id())
  with check (shop_id = current_shop_id());
