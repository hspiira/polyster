-- Order units and schema pass -- see docs/superpowers/specs/
-- 2026-08-01-order-units-and-schema-pass-model.md for rationale on every
-- decision below. Sections referenced in comments are that document's.
--
-- Run this against a scratch Supabase project first and check the
-- assertions in task-3-brief.md / task-3-report.md before applying it
-- anywhere real data lives. Not written to be idempotent/rerunnable.
--
-- Wrapped in an explicit transaction: supabase db push and the SQL editor
-- both supply an implicit one, but this file drops two columns of money
-- data, and anyone running it via `psql -f` without ON_ERROR_STOP would
-- otherwise get a partial apply on failure. The rollback guarantee should
-- not depend on how the file is invoked.
begin;


-- ============================================================
-- 0. Pre-flight. Fail loudly before touching anything if an assumption
--    the rest of this file depends on does not hold.
-- ============================================================

-- 0001_init.sql:232 allows `amount numeric(12,2) check (amount > 0)`, so a
-- sub-unit amount like 0.25 is legal today. Section 5 below converts it with
-- round(amount)::bigint, which for 0.25 is 0 -- and the new
-- payments_amount_minor_check (amount_minor > 0) would then reject it,
-- aborting mid-migration. Surface that as an explicit, named failure here
-- rather than let it happen as an opaque constraint violation three steps
-- later: a sub-unit payment is a data problem worth seeing, not one to round
-- away silently.
do $$
begin
  if exists (
    select 1 from payments
    where round(amount)::bigint <= 0 and _deleted = false
  ) then
    raise exception
      'payments contains a non-deleted row whose amount rounds to <= 0 minor units -- resolve before running this migration';
  end if;
end $$;


-- ============================================================
-- 1. New columns on existing tables, all nullable or defaulted so no
--    existing row fails. Triggers are recreated only where the table's
--    function changes (adding updated_at moves it from set_modified()
--    to set_modified_and_updated_at()).
-- ============================================================

alter table shops
  add column updated_at timestamptz not null default now(),
  add column currency text not null default 'UGX',
  add column country text not null default 'UG',
  add column address text,
  add column lock_after_minutes integer not null default 5
    check (lock_after_minutes >= 0);

drop trigger trg_shops_modified on shops;
create trigger trg_shops_modified
  before insert or update on shops
  for each row execute function set_modified_and_updated_at();

alter table staff
  add column updated_at timestamptz not null default now(),
  add column phone text,
  add column pin_updated_at timestamptz,
  add column deactivated_at timestamptz;

drop trigger trg_staff_modified on staff;
create trigger trg_staff_modified
  before insert or update on staff
  for each row execute function set_modified_and_updated_at();

alter table clients
  add column updated_at timestamptz not null default now(),
  add column created_by text references staff(id) on delete set null;

drop trigger trg_clients_modified on clients;
create trigger trg_clients_modified
  before insert or update on clients
  for each row execute function set_modified_and_updated_at();

create index idx_clients_shop_phone on clients(shop_id, phone);

alter table measurement_fields
  add column created_at timestamptz not null default now(),
  add column updated_at timestamptz not null default now(),
  add column field_type text not null default 'number'
    check (field_type in ('number', 'text')),
  add column group_label text,
  add column active boolean not null default true;

drop trigger trg_measurement_fields_modified on measurement_fields;
create trigger trg_measurement_fields_modified
  before insert or update on measurement_fields
  for each row execute function set_modified_and_updated_at();

alter table measurement_profiles
  add column created_at timestamptz not null default now();

alter table payments
  add column kind text not null default 'payment'
    check (kind in ('payment', 'refund')),
  add column created_at timestamptz not null default now(),
  add column reference text,
  add column voided_by text references staff(id) on delete set null,
  add column voided_at timestamptz,
  add column void_reason text;

alter table order_stage_history
  add column note text;


-- ============================================================
-- 2. Orders: rename, new columns, widened stage.
-- ============================================================

alter table orders rename column item_description to summary;

alter table orders
  add column reference text,
  add column currency text not null default 'UGX',
  add column price_adjustment_minor bigint not null default 0,
  add column adjustment_reason text,
  add column rental_deposit_minor bigint not null default 0
    check (rental_deposit_minor >= 0),
  add column deposit_refunded_at timestamptz,
  add column picked_up_at timestamptz,
  add column returned_at timestamptz,
  add column cancelled_at timestamptz,
  add column cancellation_reason text;

-- Model doc section 5 ("orders"): mirrors the shop_id-prefixed compound
-- indexes idx_orders_shop_due / idx_orders_shop_stage already in
-- 0001_init.sql. No unique constraint -- see that section for why a rare
-- cosmetic collision is preferable to a rejected replication push.
create index idx_orders_shop_reference on orders(shop_id, reference);

-- The two stage checks below were unnamed inline column checks in
-- 0001_init.sql, so Postgres should have auto-named them exactly as
-- guessed (orders_stage_check, order_stage_history_from_stage_check,
-- order_stage_history_to_stage_check) -- but this cannot be confirmed
-- against a live database from here. Look each one up by its actual
-- definition instead of trusting the guessed name: a wrong guess with a
-- bare `drop constraint` fails the migration outright, and a wrong guess
-- with only `if exists` would silently leave the old, narrower check in
-- place alongside the new one, permanently rejecting 'cancelled' despite
-- the migration reporting success.
do $$
declare
  c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'orders'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%stage%'
      and pg_get_constraintdef(oid) not like '%cancelled%'
  loop
    execute format('alter table orders drop constraint %I', c.conname);
  end loop;
end $$;

alter table orders add constraint orders_stage_check
  check (stage in ('measured', 'in_progress', 'ready', 'picked_up', 'returned', 'cancelled'));

do $$
declare
  c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'order_stage_history'::regclass
      and contype = 'c'
      and (pg_get_constraintdef(oid) like '%from_stage%'
           or pg_get_constraintdef(oid) like '%to_stage%')
      and pg_get_constraintdef(oid) not like '%cancelled%'
  loop
    execute format('alter table order_stage_history drop constraint %I', c.conname);
  end loop;
end $$;

alter table order_stage_history add constraint order_stage_history_from_stage_check
  check (from_stage in ('measured','in_progress','ready','picked_up','returned','cancelled'));
alter table order_stage_history add constraint order_stage_history_to_stage_check
  check (to_stage in ('measured','in_progress','ready','picked_up','returned','cancelled'));


-- ============================================================
-- 3. New tables. DDL and RLS copied verbatim from the model document,
--    sections 3 and 4.
-- ============================================================

-- ---- order_units (model doc section 3) ----

create table order_units (
  id text primary key,
  order_id text not null references orders(id) on delete cascade,
  position integer not null default 0,

  -- Null means "for the client themselves". Free text by design: beneficiaries
  -- are not records, so a repeat order for Junior copies rather than links.
  wearer_name text,
  item_description text not null check (length(trim(item_description)) > 0),
  price_minor bigint not null default 0 check (price_minor >= 0),

  -- Frozen snapshot, keyed by measurement_fields.id. Editing the client's
  -- profile later must never rewrite this.
  measurements jsonb not null default '{}'::jsonb,

  fabric_source text not null default 'shop'
    check (fabric_source in ('client', 'shop')),
  done boolean not null default false,

  catalogue_item_id text,  -- Phase 2. Moved off orders; no FK until that table exists.
  photo_url text,          -- Phase 2 Supabase Storage. Reserved, unwritten.

  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  _modified timestamptz not null default now(),
  _deleted boolean not null default false
);

create index idx_order_units_order on order_units(order_id, position);

create trigger trg_order_units_modified
  before insert or update on order_units
  for each row execute function set_modified_and_updated_at();

alter table order_units enable row level security;
create policy "shop scoped via order" on order_units
  for all to authenticated
  using (exists (select 1 from orders o
                 where o.id = order_units.order_id
                   and o.shop_id = (select current_shop_id())))
  with check (exists (select 1 from orders o
                      where o.id = order_units.order_id
                        and o.shop_id = (select current_shop_id())));

-- "At least one unit per order" is not a database constraint. A cross-table
-- check cannot be written practically here, and it would fire during
-- replication anyway, when an order row and its unit rows arrive as
-- separate statements. Enforced in writes.ts: removeOrderUnit refuses to
-- remove the last one.

-- ---- message_log (model doc section 4) ----

create table message_log (
  id text primary key,
  client_id text not null references clients(id) on delete cascade,
  order_id text references orders(id) on delete cascade,  -- null: not about an order

  channel text not null default 'whatsapp'
    check (channel in ('whatsapp', 'sms', 'call')),

  -- Deliberately not the stage enum. suggestedMessage() in whatsapp.ts switches
  -- on stage, but duplicating that enum here would mean extending two lists
  -- every time a stage is added. The stage is recorded alongside instead.
  template text not null
    check (template in ('stage_update', 'balance_reminder', 'custom')),
  order_stage text,

  sent_at timestamptz not null default now(),
  sent_by text references staff(id) on delete set null,
  _modified timestamptz not null default now(),
  _deleted boolean not null default false
);

create index idx_message_log_order on message_log(order_id, sent_at);
create index idx_message_log_client on message_log(client_id, sent_at);

-- The model document's section 4 shows no trigger for this table, but the
-- global convention in 0001_init.sql (see its RLS-section comment) is that
-- every synced table keeps _modified authoritative on the server via a
-- trigger, never trusted from the client -- payments and order_stage_history
-- follow it despite being append-mostly logs too. set_modified(), not
-- set_modified_and_updated_at(): this table has no updated_at column.
create trigger trg_message_log_modified
  before insert or update on message_log
  for each row execute function set_modified();

alter table message_log enable row level security;

-- RLS scopes through clients, not orders, because order_id is nullable and
-- client_id is not (model doc section 4). The model doc does not spell out
-- this policy's SQL; it is written here to mirror measurement_profiles'
-- "shop scoped via client" policy in 0001_init.sql, the existing table with
-- the identical shape (no shop_id column, scoped through a parent relation).
create policy "shop scoped via client" on message_log
  for all to authenticated
  using (
    exists (
      select 1 from clients c
      where c.id = message_log.client_id
        and c.shop_id = (select current_shop_id())
    )
  )
  with check (
    exists (
      select 1 from clients c
      where c.id = message_log.client_id
        and c.shop_id = (select current_shop_id())
    )
  );


-- ============================================================
-- 4. Backfill. The unit reuses the order's own id as its primary key so
--    the device-side repair in Task 9 cannot create a duplicate -- model
--    doc invariant 8. Do not change this to gen_random_uuid().
-- ============================================================

insert into order_units (id, order_id, position, item_description, price_minor, created_at, updated_at)
select o.id, o.id, 0, o.summary, round(o.price_total)::bigint, o.created_at, o.updated_at
from orders o
where o._deleted = false;

-- References: DDMM from the row's own created_at, plus a random 5-character
-- suffix drawn from the same alphabet the app uses (Crockford base32, no
-- I/L/O/U -- must match src/lib/orderReference.ts exactly).
--
-- The five substr(..., random()...) calls appear directly in the SET list
-- rather than inside a single subquery over generate_series. An uncorrelated
-- subquery (one with no reference to the outer orders row) is a candidate
-- for Postgres's InitPlan optimization: the planner may evaluate it once for
-- the whole UPDATE and reuse that one result for every row, which would
-- stamp every order with the identical suffix. Five independent top-level
-- volatile-function calls have no such subquery to hoist, so each is
-- evaluated per output row.
update orders set reference =
  to_char(created_at, 'DDMM') || '-' ||
  substr('0123456789ABCDEFGHJKMNPQRSTVWXYZ', 1 + floor(random() * 32)::int, 1) ||
  substr('0123456789ABCDEFGHJKMNPQRSTVWXYZ', 1 + floor(random() * 32)::int, 1) ||
  substr('0123456789ABCDEFGHJKMNPQRSTVWXYZ', 1 + floor(random() * 32)::int, 1) ||
  substr('0123456789ABCDEFGHJKMNPQRSTVWXYZ', 1 + floor(random() * 32)::int, 1) ||
  substr('0123456789ABCDEFGHJKMNPQRSTVWXYZ', 1 + floor(random() * 32)::int, 1)
where reference is null;

alter table orders alter column reference set not null;


-- ============================================================
-- 5. Money to minor units. Safe as a plain round() only because every
--    existing row is UGX (exponent 0). Loses at most 0.99 UGX per row --
--    see model doc section 9, open item 2.
-- ============================================================

-- order_balances (0001_init.sql:402-413) has a hard catalogue dependency on
-- orders.price_total and payments.amount -- Postgres tracks views' column
-- references and refuses to drop a column they use. It also cannot be
-- replaced in place further down: `create or replace view` may only append
-- columns, and the new column list reorders/renames/removes several
-- (price_total -> stage as position 3, amount_paid -> amount_paid_minor,
-- etc). Dropping it here, plainly, is what lets both the column drops below
-- and the later `create or replace view` succeed. Do NOT rewrite this as
-- `drop column ... cascade`: cascade would drop the view silently and leave
-- the replacement further down still wrongly shaped against a view that no
-- longer exists to be "replaced".
drop view if exists order_balances;

-- Model doc section 5: catalogue_item_id moves to order_units (see that
-- table's own column, "Phase 2. Moved off orders"). Dropped here, after the
-- view above, in case a future view revision ever references it.
alter table orders drop column catalogue_item_id;

alter table orders add column price_total_minor bigint not null default 0;
update orders set price_total_minor = round(price_total)::bigint;
alter table orders add constraint orders_price_total_minor_check
  check (price_total_minor >= 0);
alter table orders drop column price_total;

alter table payments add column amount_minor bigint;
update payments set amount_minor = round(amount)::bigint;
alter table payments alter column amount_minor set not null;
alter table payments add constraint payments_amount_minor_check check (amount_minor > 0);
alter table payments drop column amount;


-- ============================================================
-- 6. Replace the view. Copied verbatim from the model document, section 8.
--    security_invoker = on is carried forward and remains load-bearing
--    (ARCHITECTURE section 4, rule 2) -- without it any shop could read
--    every other shop's balances through this view.
-- ============================================================

create or replace view order_balances
with (security_invoker = on) as
select
  o.id as order_id,
  o.shop_id,
  o.stage,
  o.price_total_minor,
  coalesce(u.units_subtotal_minor, 0) as units_subtotal_minor,
  coalesce(p.paid_minor, 0) as amount_paid_minor,
  o.price_total_minor - coalesce(p.paid_minor, 0) as balance_minor
from orders o
left join lateral (
  select sum(ou.price_minor) as units_subtotal_minor
  from order_units ou
  where ou.order_id = o.id and ou._deleted = false
) u on true
left join lateral (
  select sum(case when pm.kind = 'refund' then -pm.amount_minor
                  else pm.amount_minor end) as paid_minor
  from payments pm
  where pm.order_id = o.id and pm._deleted = false
) p on true
where o._deleted = false;


-- ============================================================
-- 7. Realtime -- the two new tables join the same publication every other
--    synced table is already in (0001_init.sql).
-- ============================================================

alter publication supabase_realtime add table order_units, message_log;

commit;
