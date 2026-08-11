-- Generic product catalogue: categories, products, variants.
-- See docs/POLYSTER.md sections 17-19.
begin;

create table product_categories (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  _modified timestamptz not null default now(),
  _deleted boolean not null default false,

  unique (shop_id, name)
);

create index idx_product_categories_shop on product_categories(shop_id);

create trigger trg_product_categories_modified
  before insert or update on product_categories
  for each row execute function set_modified_and_updated_at();


create table products (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  category_id uuid references product_categories(id) on delete set null,

  name text not null check (length(trim(name)) > 0),
  description text,
  brand text,
  product_type text not null default 'garment'
    check (product_type in ('garment', 'accessory', 'service', 'rental', 'custom')),
  image_url text,
  active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  _modified timestamptz not null default now(),
  _deleted boolean not null default false
);

create index idx_products_shop on products(shop_id);
create index idx_products_category on products(category_id);

create trigger trg_products_modified
  before insert or update on products
  for each row execute function set_modified_and_updated_at();


create table product_variants (
  id uuid primary key default gen_random_uuid(),
  -- Denormalised from products.shop_id so SKU uniqueness can be scoped to a
  -- tenant without a join (docs/POLYSTER.md section 65).
  shop_id uuid not null references shops(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,

  sku text not null check (length(trim(sku)) > 0),
  size text,
  colour text,
  price_minor bigint not null default 0 check (price_minor >= 0),
  cost_minor bigint not null default 0 check (cost_minor >= 0),
  active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  _modified timestamptz not null default now(),
  _deleted boolean not null default false,

  unique (shop_id, sku)
);

create index idx_product_variants_shop on product_variants(shop_id);
create index idx_product_variants_product on product_variants(product_id);

create trigger trg_product_variants_modified
  before insert or update on product_variants
  for each row execute function set_modified_and_updated_at();


-- ============================================================
-- Row Level Security
-- ============================================================

alter table product_categories enable row level security;
create policy "shop scoped" on product_categories
  for all to authenticated
  using (shop_id = (select current_shop_id()))
  with check (shop_id = (select current_shop_id()));

alter table products enable row level security;
create policy "shop scoped" on products
  for all to authenticated
  using (shop_id = (select current_shop_id()))
  with check (shop_id = (select current_shop_id()));

alter table product_variants enable row level security;
create policy "shop scoped" on product_variants
  for all to authenticated
  using (shop_id = (select current_shop_id()))
  with check (shop_id = (select current_shop_id()));


alter publication supabase_realtime add table product_categories, products, product_variants;

commit;
