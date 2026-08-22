-- Cloth Tailoring & Rental Tracker -- initial schema
-- Mirrors pwa-schema-and-screens.md. Every synced table carries _modified
-- and _deleted, required by RxDB's Supabase replication plugin -- see
-- ARCHITECTURE.md section 5 and pwa-stack-options.md section 3.
--
-- Note: _modified and _deleted exist here as Postgres columns only. They are
-- deliberately NOT declared in the RxDB schemas (src/db/schema.ts) -- RxDB
-- rejects underscore-prefixed fields, and the replication plugin does not
-- need them there. See the header comment in that file.
--
-- Run this in the Supabase SQL editor (or via the Supabase CLI) against a
-- fresh project. Safe to run once; not written to be idempotent/rerunnable.

-- gen_random_uuid() -- normally already available on Supabase projects,
-- this is defensive in case it isn't enabled yet.
create extension if not exists pgcrypto;


-- ============================================================
-- Trigger helpers: keep _modified authoritative on the server,
-- never trusted from the client. The RxDB Supabase plugin strips
-- _modified before sending updates and relies on the server to set it.
--
-- `set search_path` is not optional hardening. Without it, the search_path
-- in effect is the caller's, which is a documented privilege-escalation
-- route for functions and is flagged by Supabase's own database linter
-- (function_search_path_mutable).
-- ============================================================

create or replace function set_modified()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new._modified = now();
  return new;
end;
$$;

create or replace function set_modified_and_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new._modified = now();
  new.updated_at = now();
  return new;
end;
$$;


-- ============================================================
-- shops -- one row per tenant. supabase_auth_user_id is the one
-- shared login this shop's app instance authenticates as (see
-- ARCHITECTURE.md section 4 -- shop-level auth, PIN is attribution only).
-- ============================================================

create table shops (
  id text primary key,
  name text not null check (length(trim(name)) > 0),
  whatsapp_number text,
  supabase_auth_user_id uuid not null unique references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  _modified timestamptz not null default now(),
  _deleted boolean not null default false
);

create trigger trg_shops_modified
  before insert or update on shops
  for each row execute function set_modified();

-- Lookup used by every other table's RLS policy: which shop is the
-- currently authenticated Supabase user?
--
-- security definer is required. Under RLS, a plain function would read
-- `shops` through the caller's own policy, and that policy is itself defined
-- in terms of auth.uid() -- workable here but circular and fragile. Reading
-- the mapping with the definer's rights keeps the tenant lookup independent
-- of the policies built on top of it.
create or replace function current_shop_id()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.shops where supabase_auth_user_id = (select auth.uid())
$$;

revoke execute on function current_shop_id() from public;
grant execute on function current_shop_id() to authenticated;


-- ============================================================
-- staff -- PIN-holders within a shop. pin_hash only, never the raw PIN.
-- ============================================================

create table staff (
  id text primary key,
  shop_id text not null references shops(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  pin_hash text not null,
  role text not null default 'staff' check (role in ('owner', 'staff')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  _modified timestamptz not null default now(),
  _deleted boolean not null default false
);
create index idx_staff_shop_id on staff(shop_id);

create trigger trg_staff_modified
  before insert or update on staff
  for each row execute function set_modified();


-- ============================================================
-- clients
-- ============================================================

create table clients (
  id text primary key,
  shop_id text not null references shops(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  phone text,
  notes text,
  created_at timestamptz not null default now(),
  _modified timestamptz not null default now(),
  _deleted boolean not null default false
);
create index idx_clients_shop_id on clients(shop_id);

create trigger trg_clients_modified
  before insert or update on clients
  for each row execute function set_modified();


-- ============================================================
-- measurement_fields -- per-shop configurable list (chest/waist vs
-- bust/hip, etc.) -- see pwa-schema-and-screens.md section 2.
-- ============================================================

create table measurement_fields (
  id text primary key,
  shop_id text not null references shops(id) on delete cascade,
  label text not null check (length(trim(label)) > 0),
  unit text,
  display_order integer not null default 0,
  _modified timestamptz not null default now(),
  _deleted boolean not null default false
);
create index idx_measurement_fields_shop_id on measurement_fields(shop_id);

create trigger trg_measurement_fields_modified
  before insert or update on measurement_fields
  for each row execute function set_modified();


-- ============================================================
-- measurement_profiles -- one per client, values keyed by
-- measurement_fields.id. No shop_id directly; RLS scopes through clients.
-- ============================================================

create table measurement_profiles (
  id text primary key,
  -- "One profile per client" is stated in ARCHITECTURE.md section 5. Enforce
  -- it, rather than leaving the app to hope there is only ever one row.
  client_id text not null unique references clients(id) on delete cascade,
  values jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by text references staff(id) on delete set null,
  _modified timestamptz not null default now(),
  _deleted boolean not null default false
);

create trigger trg_measurement_profiles_modified
  before insert or update on measurement_profiles
  for each row execute function set_modified_and_updated_at();


-- ============================================================
-- orders -- the core work-tracking record. catalogue_item_id has no FK
-- yet since catalogue_items doesn't exist until the Phase 2 migration --
-- see IMPLEMENTATION_PLAN.md.
-- ============================================================

create table orders (
  id text primary key,
  shop_id text not null references shops(id) on delete cascade,
  client_id text not null references clients(id) on delete restrict,
  order_type text not null check (order_type in ('tailor_made', 'rental', 'purchase')),
  item_description text not null check (length(trim(item_description)) > 0),
  stage text not null default 'measured'
    check (stage in ('measured', 'in_progress', 'ready', 'picked_up', 'returned')),
  price_total numeric(12, 2) not null default 0 check (price_total >= 0),
  pickup_due_date date not null,
  return_due_date date,
  catalogue_item_id text, -- reserved for Phase 2, no FK yet
  notes text,
  created_by text references staff(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  _modified timestamptz not null default now(),
  _deleted boolean not null default false,
  -- A rental that comes back before it goes out is a data-entry error.
  constraint orders_return_after_pickup
    check (return_due_date is null or return_due_date >= pickup_due_date)
);
create index idx_orders_shop_id on orders(shop_id);
create index idx_orders_client_id on orders(client_id);
-- Mirrors the compound indexes on the RxDB side (src/db/schema.ts): the
-- dashboard's hot queries are per-shop by due date and per-shop by stage.
create index idx_orders_shop_due on orders(shop_id, pickup_due_date);
create index idx_orders_shop_stage on orders(shop_id, stage);

create trigger trg_orders_modified
  before insert or update on orders
  for each row execute function set_modified_and_updated_at();


-- ============================================================
-- payments -- multiple per order; balance is always derived
-- (see order_balances view below), never stored redundantly.
-- ============================================================

create table payments (
  id text primary key,
  order_id text not null references orders(id) on delete cascade,
  -- Positive only. A mistaken payment is voided by setting _deleted, not by
  -- entering a negative correcting row -- see pwa-stack-options.md section 3.
  amount numeric(12, 2) not null check (amount > 0),
  payment_date timestamptz not null default now(),
  method text not null default 'cash'
    check (method in ('cash', 'mobile_money', 'bank', 'other')),
  recorded_by text references staff(id) on delete set null,
  notes text,
  _modified timestamptz not null default now(),
  _deleted boolean not null default false
);
create index idx_payments_order_id on payments(order_id);

create trigger trg_payments_modified
  before insert or update on payments
  for each row execute function set_modified();


-- ============================================================
-- order_stage_history -- audit trail of who advanced an order through
-- which stage and when. Included by default per ARCHITECTURE.md section 5
-- (cheap to add now, expensive to retrofit later).
-- ============================================================

create table order_stage_history (
  id text primary key,
  order_id text not null references orders(id) on delete cascade,
  from_stage text check (from_stage in ('measured', 'in_progress', 'ready', 'picked_up', 'returned')),
  to_stage text not null check (to_stage in ('measured', 'in_progress', 'ready', 'picked_up', 'returned')),
  changed_by text references staff(id) on delete set null,
  changed_at timestamptz not null default now(),
  _modified timestamptz not null default now(),
  _deleted boolean not null default false
);
create index idx_order_stage_history_order_id on order_stage_history(order_id);

create trigger trg_order_stage_history_modified
  before insert or update on order_stage_history
  for each row execute function set_modified();


-- ============================================================
-- Row Level Security -- every table scoped to the authenticated shop.
-- See ARCHITECTURE.md section 4: this is what guarantees one shop can
-- never see or modify another shop's data, enforced in the database,
-- not by app code remembering to filter correctly.
--
-- Two conventions applied throughout, both deliberate:
--
--  1. Every policy names `to authenticated`. Without it a policy applies to
--     `public`, which includes the `anon` role. It would still deny (auth.uid()
--     is null for anon, so current_shop_id() returns null and every comparison
--     is null) but relying on that is relying on an accident.
--  2. current_shop_id() is wrapped in `(select ...)`. Postgres then evaluates
--     it once per statement as an InitPlan instead of once per row. This is
--     Supabase's documented RLS performance guidance and the difference is
--     large on a full-table scan.
-- ============================================================

alter table shops enable row level security;

-- select/update only, not `for all`. A shop row is provisioned out-of-band
-- (see the manual step at the bottom of this file); an authenticated client
-- has no business inserting or deleting one, and `for all` would let it.
create policy "shop reads its own row" on shops
  for select to authenticated
  using (supabase_auth_user_id = (select auth.uid()));

create policy "shop updates its own row" on shops
  for update to authenticated
  using (supabase_auth_user_id = (select auth.uid()))
  with check (supabase_auth_user_id = (select auth.uid()));

alter table staff enable row level security;
create policy "shop scoped" on staff
  for all to authenticated
  using (shop_id = (select current_shop_id()))
  with check (shop_id = (select current_shop_id()));

alter table clients enable row level security;
create policy "shop scoped" on clients
  for all to authenticated
  using (shop_id = (select current_shop_id()))
  with check (shop_id = (select current_shop_id()));

alter table measurement_fields enable row level security;
create policy "shop scoped" on measurement_fields
  for all to authenticated
  using (shop_id = (select current_shop_id()))
  with check (shop_id = (select current_shop_id()));

alter table measurement_profiles enable row level security;
create policy "shop scoped via client" on measurement_profiles
  for all to authenticated
  using (
    exists (
      select 1 from clients c
      where c.id = measurement_profiles.client_id
        and c.shop_id = (select current_shop_id())
    )
  )
  with check (
    exists (
      select 1 from clients c
      where c.id = measurement_profiles.client_id
        and c.shop_id = (select current_shop_id())
    )
  );

alter table orders enable row level security;
create policy "shop scoped" on orders
  for all to authenticated
  using (shop_id = (select current_shop_id()))
  with check (shop_id = (select current_shop_id()));

alter table payments enable row level security;
create policy "shop scoped via order" on payments
  for all to authenticated
  using (
    exists (
      select 1 from orders o
      where o.id = payments.order_id
        and o.shop_id = (select current_shop_id())
    )
  )
  with check (
    exists (
      select 1 from orders o
      where o.id = payments.order_id
        and o.shop_id = (select current_shop_id())
    )
  );

alter table order_stage_history enable row level security;
create policy "shop scoped via order" on order_stage_history
  for all to authenticated
  using (
    exists (
      select 1 from orders o
      where o.id = order_stage_history.order_id
        and o.shop_id = (select current_shop_id())
    )
  )
  with check (
    exists (
      select 1 from orders o
      where o.id = order_stage_history.order_id
        and o.shop_id = (select current_shop_id())
    )
  );


-- ============================================================
-- order_balances -- a view, not a table. price_total minus payments,
-- computed on read. Nothing writes to this directly.
--
-- `security_invoker = on` is load-bearing, not a style choice. A Postgres
-- view runs with the privileges of its OWNER by default, and this migration
-- is run from the SQL editor as a role that bypasses RLS. Without this
-- setting, the underlying orders/payments policies would not be applied to
-- the caller and any authenticated shop could read every other shop's
-- balances through the view. Requires Postgres 15+, which Supabase provides.
--
-- Verify it: log in as shop A and run `select * from order_balances` with
-- shop B's data present. This is a Phase 0 exit-checklist item.
--
-- This view is server-side only. The UI must NOT read it: RxDB replicates
-- tables, not views, so a balance fetched from here is a network call on the
-- screen most likely to be used offline. Balances are computed locally from
-- the replicated `payments` collection -- see src/db/balances.ts.
-- ============================================================

create or replace view order_balances
with (security_invoker = on) as
select
  o.id as order_id,
  o.shop_id,
  o.price_total,
  coalesce(sum(p.amount) filter (where p._deleted = false), 0) as amount_paid,
  o.price_total - coalesce(sum(p.amount) filter (where p._deleted = false), 0) as balance
from orders o
left join payments p on p.order_id = o.id
where o._deleted = false
group by o.id, o.shop_id, o.price_total;


-- ============================================================
-- Realtime -- required for RxDB's live sync (the pull.stream$ subscription
-- in src/db/replication.ts listens via Supabase Realtime's postgres_changes).
-- ============================================================

alter publication supabase_realtime add table
  shops, staff, clients, measurement_fields, measurement_profiles,
  orders, payments, order_stage_history;


-- ============================================================
-- Manual step after running this migration (not scriptable here --
-- needs a real Supabase project and dashboard access):
--
-- For each shop, create one Supabase Auth user (Authentication ->
-- Add user in the dashboard, or supabase.auth.signUp from a setup
-- script), then insert a matching row:
--
--   insert into shops (name, whatsapp_number, supabase_auth_user_id)
--   values ('Example Shop', '+256700000000', '<auth user uuid>');
--
-- The shops RLS policies above intentionally do not permit insert, so this
-- runs as the service role / SQL editor, not from the app.
--
-- See README.md for the full setup walkthrough.
-- ============================================================
