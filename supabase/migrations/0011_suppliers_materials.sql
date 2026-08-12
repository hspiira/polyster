-- Suppliers and materials (Phase 3). Online-only per docs/POLYSTER.md
-- section 46.1 -- no RxDB collection, no offline support for these tables,
-- and therefore no _modified/_deleted columns (those are the replication
-- protocol's, not this table's).
begin;

-- set_modified_and_updated_at() (0001_init.sql) assumes a _modified column,
-- which online-only tables don't have. This is the equivalent for them.
create or replace function set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table suppliers (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  phone text,
  email text,
  address text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_suppliers_shop on suppliers(shop_id);

create trigger trg_suppliers_modified
  before insert or update on suppliers
  for each row execute function set_updated_at();


create table materials (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  supplier_id uuid references suppliers(id) on delete set null,

  name text not null check (length(trim(name)) > 0),
  description text,
  material_type text not null default 'other'
    check (material_type in ('fabric', 'thread', 'button', 'zipper', 'label', 'packaging', 'other')),
  unit text not null default 'unit',

  -- Simple counter for Phase 3. Phase 4 introduces the movement ledger
  -- (docs/POLYSTER.md section 27); this field becomes the ledger's running
  -- total at that point rather than being directly editable.
  quantity_on_hand numeric(12, 2) not null default 0 check (quantity_on_hand >= 0),
  reorder_level numeric(12, 2) not null default 0 check (reorder_level >= 0),

  unit_cost_minor bigint not null default 0 check (unit_cost_minor >= 0),
  currency text not null default 'UGX',

  -- Fabric-only, optional (docs/POLYSTER.md section 25).
  composition text,
  gsm integer,
  width text,
  colour text,
  pattern text,
  supplier_reference text,

  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_materials_shop on materials(shop_id);
create index idx_materials_supplier on materials(supplier_id);

create trigger trg_materials_modified
  before insert or update on materials
  for each row execute function set_updated_at();


-- ============================================================
-- Row Level Security
-- ============================================================

alter table suppliers enable row level security;
create policy "shop scoped" on suppliers
  for all to authenticated
  using (shop_id = (select current_shop_id()))
  with check (shop_id = (select current_shop_id()));

alter table materials enable row level security;
create policy "shop scoped" on materials
  for all to authenticated
  using (shop_id = (select current_shop_id()))
  with check (shop_id = (select current_shop_id()));

commit;
