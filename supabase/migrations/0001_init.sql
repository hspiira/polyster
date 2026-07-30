-- Cloth Tailoring & Rental Tracker -- initial schema
-- Mirrors pwa-schema-and-screens.md. Every synced table carries _modified
-- and _deleted, required by RxDB's Supabase replication plugin -- see
-- ARCHITECTURE.md section 5 and pwa-stack-options.md section 3.
--
-- Run this in the Supabase SQL editor (or via the Supabase CLI) against a
-- fresh project. Safe to run once; not written to be idempotent/rerunnable.

-- gen_random_uuid() -- normally already available on Supabase projects,
-- this is defensive in case it isn't enabled yet.
create extension if not exists pgcrypto;


-- ============================================================
-- Trigger helpers: keep _modified authoritative on the server,
-- never trusted from the client. See db/replication.ts comments --
-- the RxDB Supabase plugin deliberately strips _modified before
-- sending updates and relies on the server to set it.
-- ============================================================

create or replace function set_modified()
returns trigger as $$
begin
  new._modified = now();
  return new;
end;
$$ language plpgsql;

create or replace function set_modified_and_updated_at()
returns trigger as $$
begin
  new._modified = now();
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;


-- ============================================================
-- shops -- one row per tenant. supabase_auth_user_id is the one
-- shared login this shop's app instance authenticates as (see
-- ARCHITECTURE.md section 4 -- shop-level auth, PIN is attribution only).
-- ============================================================

create table shops (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  whatsapp_number text,
  supabase_auth_user_id uuid not null unique references auth.users(id),
  created_at timestamptz not null default now(),
  _modified timestamptz not null default now(),
  _deleted boolean not null default false
);

create trigger trg_shops_modified
  before insert or update on shops
  for each row execute function set_modified();

-- Lookup used by every other table's RLS policy: which shop is the
-- currently authenticated Supabase user?
create or replace function current_shop_id()
returns uuid
language sql
stable
as $$
  select id from shops where supabase_auth_user_id = auth.uid()
$$;


-- ============================================================
-- staff -- PIN-holders within a shop. pin_hash only, never the raw PIN.
-- ============================================================

create table staff (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id),
  name text not null,
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
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id),
  name text not null,
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
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id),
  label text not null,
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
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id),
  values jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references staff(id),
  _modified timestamptz not null default now(),
  _deleted boolean not null default false
);
create index idx_measurement_profiles_client_id on measurement_profiles(client_id);

create trigger trg_measurement_profiles_modified
  before insert or update on measurement_profiles
  for each row execute function set_modified_and_updated_at();


-- ============================================================
-- orders -- the core work-tracking record. catalogue_item_id has no FK
-- yet since catalogue_items doesn't exist until the Phase 2 migration --
-- see IMPLEMENTATION_PLAN.md.
-- ============================================================

create table orders (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id),
  client_id uuid not null references clients(id),
  order_type text not null check (order_type in ('tailor_made', 'rental', 'purchase')),
  item_description text not null,
  stage text not null default 'measured'
    check (stage in ('measured', 'in_progress', 'ready', 'picked_up', 'returned')),
  price_total numeric(12, 2) not null default 0,
  pickup_due_date date not null,
  return_due_date date,
  catalogue_item_id uuid, -- reserved for Phase 2, no FK yet
  notes text,
  created_by uuid references staff(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  _modified timestamptz not null default now(),
  _deleted boolean not null default false
);
create index idx_orders_shop_id on orders(shop_id);
create index idx_orders_client_id on orders(client_id);

create trigger trg_orders_modified
  before insert or update on orders
  for each row execute function set_modified_and_updated_at();


-- ============================================================
-- payments -- multiple per order; balance is always derived
-- (see order_balances view below), never stored redundantly.
-- ============================================================

create table payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id),
  amount numeric(12, 2) not null,
  payment_date timestamptz not null default now(),
  method text not null default 'cash'
    check (method in ('cash', 'mobile_money', 'bank', 'other')),
  recorded_by uuid references staff(id),
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
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id),
  from_stage text,
  to_stage text not null,
  changed_by uuid references staff(id),
  changed_at timestamptz not null default now(),
  _modified timestamptz not null default now(),
  _deleted boolean not null default false
);
create index idx_order_stage_history_order_id on order_stage_history(order_id);

create trigger trg_order_stage_history_modified
  before insert or update on order_stage_history
  for each row execute function set_modified();


-- ============================================================
-- order_balances -- a view, not a table. price_total minus payments,
-- computed on read. Nothing writes to this directly.
-- ============================================================

create or replace view order_balances as
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
-- Row Level Security -- every table scoped to the authenticated shop.
-- See ARCHITECTURE.md section 4: this is what guarantees one shop can
-- never see or modify another shop's data, enforced in the database,
-- not by app code remembering to filter correctly.
-- ============================================================

alter table shops enable row level security;
create policy "shop reads/updates its own row" on shops
  for all
  using (supabase_auth_user_id = auth.uid())
  with check (supabase_auth_user_id = auth.uid());

alter table staff enable row level security;
create policy "shop scoped" on staff
  for all
  using (shop_id = current_shop_id())
  with check (shop_id = current_shop_id());

alter table clients enable row level security;
create policy "shop scoped" on clients
  for all
  using (shop_id = current_shop_id())
  with check (shop_id = current_shop_id());

alter table measurement_fields enable row level security;
create policy "shop scoped" on measurement_fields
  for all
  using (shop_id = current_shop_id())
  with check (shop_id = current_shop_id());

alter table measurement_profiles enable row level security;
create policy "shop scoped via client" on measurement_profiles
  for all
  using (client_id in (select id from clients where shop_id = current_shop_id()))
  with check (client_id in (select id from clients where shop_id = current_shop_id()));

alter table orders enable row level security;
create policy "shop scoped" on orders
  for all
  using (shop_id = current_shop_id())
  with check (shop_id = current_shop_id());

alter table payments enable row level security;
create policy "shop scoped via order" on payments
  for all
  using (order_id in (select id from orders where shop_id = current_shop_id()))
  with check (order_id in (select id from orders where shop_id = current_shop_id()));

alter table order_stage_history enable row level security;
create policy "shop scoped via order" on order_stage_history
  for all
  using (order_id in (select id from orders where shop_id = current_shop_id()))
  with check (order_id in (select id from orders where shop_id = current_shop_id()));

-- order_balances is a plain view over orders/payments, both of which
-- already have RLS -- Postgres applies the underlying tables' policies
-- automatically, no separate policy needed on the view itself.


-- ============================================================
-- Realtime -- required for RxDB's live sync (the pull.stream$ subscription
-- in db/replication.ts listens via Supabase Realtime's postgres_changes).
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
-- See README.md for the full setup walkthrough.
-- ============================================================
