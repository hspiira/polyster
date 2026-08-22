-- Inventory ledger (Phase 4). Online-only per docs/POLYSTER.md section 46.1.
--
-- The section 28 invariant ("never allow arbitrary stock changes without
-- recording a movement") is enforced here at the database level, not just in
-- application code: inventory_items has no UPDATE policy at all, so no
-- client can change its quantity directly. The only writer of quantity is
-- the trigger below, which runs after a movement is inserted.
begin;

create table inventory_items (
  id text primary key,
  shop_id text not null references shops(id) on delete cascade,
  item_type text not null check (item_type in ('product_variant', 'material')),
  product_variant_id text references product_variants(id) on delete cascade,
  material_id text references materials(id) on delete cascade,
  quantity numeric(12, 2) not null default 0,
  unit text not null default 'unit',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint inventory_items_item_matches_type check (
    (item_type = 'product_variant' and product_variant_id is not null and material_id is null)
    or
    (item_type = 'material' and material_id is not null and product_variant_id is null)
  ),
  unique (product_variant_id),
  unique (material_id)
);

create index idx_inventory_items_shop on inventory_items(shop_id);

-- No update trigger needed: the column default handles insert, and
-- apply_inventory_movement() below sets updated_at explicitly on its one
-- write path.

create table inventory_movements (
  id text primary key,
  shop_id text not null references shops(id) on delete cascade,
  inventory_item_id text not null references inventory_items(id) on delete cascade,

  movement_type text not null
    check (movement_type in (
      'purchase', 'production', 'sale', 'order_reservation', 'order_fulfilment',
      'return', 'damage', 'loss', 'adjustment', 'sample', 'repair'
    )),
  -- Signed: positive adds to stock, negative removes. The running total on
  -- inventory_items.quantity is this column's sum, maintained by the
  -- trigger below -- never written directly.
  quantity numeric(12, 2) not null check (quantity <> 0),

  -- Polymorphic, deliberately no FK: a movement may point at a purchase,
  -- a production batch, an order, or nothing at all.
  reference_type text,
  reference_id text,

  -- Required for 'adjustment' specifically (section 28: "a stock adjustment
  -- must have a reason") -- enforced below, optional for every other type.
  reason text,
  notes text,
  created_by text references staff(id) on delete set null,
  created_at timestamptz not null default now(),

  constraint inventory_movements_adjustment_needs_reason check (
    movement_type <> 'adjustment' or (reason is not null and length(trim(reason)) > 0)
  )
);

create index idx_inventory_movements_shop on inventory_movements(shop_id);
create index idx_inventory_movements_item on inventory_movements(inventory_item_id);

-- The one and only writer of inventory_items.quantity.
create or replace function apply_inventory_movement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.inventory_items
    set quantity = quantity + new.quantity,
        updated_at = now()
    where id = new.inventory_item_id;
  return new;
end;
$$;

revoke execute on function apply_inventory_movement() from public;

create trigger trg_apply_inventory_movement
  after insert on inventory_movements
  for each row execute function apply_inventory_movement();


-- ============================================================
-- Row Level Security
-- ============================================================

alter table inventory_items enable row level security;

-- No UPDATE policy, deliberately -- see header comment.
create policy "shop scoped select" on inventory_items
  for select to authenticated
  using (shop_id = (select current_shop_id()));

create policy "shop scoped insert" on inventory_items
  for insert to authenticated
  with check (shop_id = (select current_shop_id()));

alter table inventory_movements enable row level security;

-- Movements are an append-only audit trail: select and insert only, no
-- update or delete policy -- a mistaken movement is corrected with an
-- offsetting adjustment movement, never edited or removed.
create policy "shop scoped select" on inventory_movements
  for select to authenticated
  using (shop_id = (select current_shop_id()));

create policy "shop scoped insert" on inventory_movements
  for insert to authenticated
  with check (shop_id = (select current_shop_id()));

commit;
