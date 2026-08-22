-- Garment identity (Phase 8, section 29). Online-only per section 46.1.
-- Generic -- any tenant may track individual garments, not just
-- NORTH//FOUND (section 29: "Generic apparel businesses may track stock at
-- variant level... NORTH//FOUND can optionally track individual garments").
begin;

create table garment_units (
  id text primary key,
  shop_id text not null references shops(id) on delete cascade,
  product_variant_id text not null references product_variants(id) on delete restrict,

  -- Nullable despite section 29's field list showing no "?": forcing every
  -- unit through a tracked production batch would break a tenant that has
  -- garment_identity on but production off, an otherwise-valid combination
  -- this schema doesn't forbid elsewhere.
  production_batch_id text references production_batches(id) on delete set null,

  -- The business-facing identity (section 30's "F002-B01-017"). The row's
  -- own uuid is the actual database identity; this is never the primary key.
  serial_number text not null check (length(trim(serial_number)) > 0),
  status text not null default 'produced'
    check (status in ('produced', 'available', 'reserved', 'sold', 'returned', 'repair', 'retired', 'lost', 'damaged')),

  customer_id text references clients(id) on delete set null,
  sold_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (shop_id, serial_number)
);

create index idx_garment_units_shop on garment_units(shop_id);
create index idx_garment_units_variant on garment_units(product_variant_id);
create index idx_garment_units_batch on garment_units(production_batch_id);
create index idx_garment_units_customer on garment_units(customer_id);

create trigger trg_garment_units_updated_at
  before insert or update on garment_units
  for each row execute function set_updated_at();

alter table garment_units enable row level security;
create policy "shop scoped" on garment_units
  for all to authenticated
  using (shop_id = (select current_shop_id()))
  with check (shop_id = (select current_shop_id()));

commit;
