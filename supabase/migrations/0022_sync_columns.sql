-- Every synced table gets the same three columns, so the sync engine has one
-- code path and no special cases.
--
--   updated_at   when the device recorded the change. Client-set. This is what
--                orders competing edits, and it has to be the device's clock
--                because the change happened offline.
--   deleted_at   soft delete, replacing the _deleted boolean. Carries *when*,
--                which a purge policy needs and a boolean cannot give.
--   _modified    when the server accepted the row. Server-set, by trigger,
--                never trusted from the client.
--
-- updated_at and _modified are NOT redundant, and collapsing them would break
-- the pull cursor. A row written offline on Monday and pushed on Friday has
-- Monday's updated_at; a device that pulled on Wednesday must still receive it,
-- which only Friday's _modified can express. Client time orders conflicts,
-- server time drives the cursor.

-- ============================================================
-- 1. Server-set cursor on the eight tables built as online-only,
--    which never needed sync scaffolding until now.
-- ============================================================

alter table suppliers              add column _modified timestamptz not null default now();
alter table materials              add column _modified timestamptz not null default now();
alter table inventory_items        add column _modified timestamptz not null default now();
alter table inventory_movements    add column _modified timestamptz not null default now();
alter table production_batches     add column _modified timestamptz not null default now();
alter table production_batch_costs add column _modified timestamptz not null default now();
alter table collections            add column _modified timestamptz not null default now();
alter table garment_units          add column _modified timestamptz not null default now();

-- ============================================================
-- 2. updated_at everywhere it is missing. Append-only rows are never edited,
--    but they carry it so the engine needs no exceptions.
-- ============================================================

alter table payments               add column updated_at timestamptz not null default now();
alter table order_stage_history    add column updated_at timestamptz not null default now();
alter table message_log            add column updated_at timestamptz not null default now();
alter table inventory_movements    add column updated_at timestamptz not null default now();
alter table production_batch_costs add column updated_at timestamptz not null default now();

alter table order_stage_history    add column created_at timestamptz not null default now();
alter table message_log            add column created_at timestamptz not null default now();

-- ============================================================
-- 3. deleted_at replaces the _deleted boolean.
--
-- order_balances reads _deleted on three tables, so it goes first and comes
-- back at the end reading deleted_at instead.
-- ============================================================

drop view if exists order_balances;

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

do $$
declare
  t text;
begin
  foreach t in array array[
    'shops','staff','clients','measurement_fields','measurement_profiles','orders',
    'order_units','order_stage_history','payments','sales','expenses','message_log',
    'tenant_features','products','product_variants','product_categories',
    'suppliers','materials','inventory_items','inventory_movements',
    'production_batches','production_batch_costs','collections','garment_units'
  ]
  loop
    -- deleted_at, carried over from _deleted where that existed.
    execute format('alter table public.%I add column if not exists deleted_at timestamptz', t);

    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = t and column_name = '_deleted'
    ) then
      execute format(
        'update public.%I set deleted_at = coalesce(_modified, now()) where _deleted = true', t);
      execute format('alter table public.%I drop column _deleted', t);
    end if;

    execute format('create index if not exists idx_%s_modified on public.%I (_modified)', t, t);

    -- One trigger per table, so _modified is the server's word in every case.
    execute format('drop trigger if exists trg_%s_modified on public.%I', t, t);
    execute format(
      'create trigger trg_%s_modified before insert or update on public.%I
         for each row execute function public.set_modified()', t, t);
  end loop;
end $$;

-- ============================================================
-- 4. The three stores the device has and the server never got: they arrived
--    with the Dexie switch and nothing server-side was written for them.
-- ============================================================

create table events (
  id text primary key,
  shop_id text not null references shops(id) on delete cascade,
  at timestamptz not null,
  actor_staff_id text references staff(id) on delete set null,
  entity text not null,
  entity_id text not null,
  action text not null check (action in ('created', 'updated', 'deleted', 'restored')),
  before jsonb,
  after jsonb,
  summary text,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  _modified timestamptz not null default now()
);
create index idx_events_shop_at on events(shop_id, at desc);
create index idx_events_entity on events(entity, entity_id);
create index idx_events_modified on events(_modified);

create trigger trg_events_modified
  before insert or update on events
  for each row execute function set_modified();

alter table events enable row level security;
create policy "shop scoped" on events
  for all to authenticated
  using (shop_id = (select current_shop_id()))
  with check (shop_id = (select current_shop_id()));

-- Lists a shop defines for itself, like measurement_fields. Same shape twice
-- rather than one table with a discriminator: they are read separately and a
-- shared table would need filtering on every query.
create table expense_categories (
  id text primary key,
  shop_id text not null references shops(id) on delete cascade,
  label text not null check (length(trim(label)) > 0),
  active boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  _modified timestamptz not null default now()
);
create index idx_expense_categories_shop on expense_categories(shop_id);
create index idx_expense_categories_modified on expense_categories(_modified);

create trigger trg_expense_categories_modified
  before insert or update on expense_categories
  for each row execute function set_modified();

alter table expense_categories enable row level security;
create policy "shop scoped" on expense_categories
  for all to authenticated
  using (shop_id = (select current_shop_id()))
  with check (shop_id = (select current_shop_id()));

create table material_types (
  id text primary key,
  shop_id text not null references shops(id) on delete cascade,
  label text not null check (length(trim(label)) > 0),
  active boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  _modified timestamptz not null default now()
);
create index idx_material_types_shop on material_types(shop_id);
create index idx_material_types_modified on material_types(_modified);

create trigger trg_material_types_modified
  before insert or update on material_types
  for each row execute function set_modified();

alter table material_types enable row level security;
create policy "shop scoped" on material_types
  for all to authenticated
  using (shop_id = (select current_shop_id()))
  with check (shop_id = (select current_shop_id()));

-- ============================================================
-- 5. order_balances, rebuilt against deleted_at. Same figures; the app's own
--    src/db/balances.ts mirrors these rules and both are tested.
-- ============================================================

create or replace view order_balances
with (security_invoker = on)
as
select
  o.id as order_id,
  o.shop_id,
  o.stage,
  o.price_total_minor,
  coalesce(u.units_subtotal_minor, 0) as units_subtotal_minor,
  coalesce(p.paid_minor, 0) as amount_paid_minor,
  o.price_total_minor::numeric - coalesce(p.paid_minor, 0) as balance_minor
from orders o
left join lateral (
  select sum(ou.price_minor) as units_subtotal_minor
  from order_units ou
  where ou.order_id = o.id and ou.deleted_at is null
) u on true
left join lateral (
  select sum(case when pm.kind = 'refund' then -pm.amount_minor else pm.amount_minor end) as paid_minor
  from payments pm
  where pm.order_id = o.id and pm.deleted_at is null
) p on true
where o.deleted_at is null;
