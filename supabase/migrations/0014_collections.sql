-- Collections (Phase 6). Online-only per docs/POLYSTER.md section 46.1.
-- Generic, not a NORTH//FOUND-only concept -- see section 21: the optional
-- coordinate/story fields are just that, optional, for any tenant.
begin;

create table collections (
  id text primary key,
  shop_id text not null references shops(id) on delete cascade,

  name text not null check (length(trim(name)) > 0),
  code text,
  description text,
  status text not null default 'draft'
    check (status in ('draft', 'planned', 'active', 'sold_out', 'archived')),
  release_date date,
  cover_image_url text,

  -- Optional, generic (section 21). Latitude/longitude use numeric rather
  -- than a geography type -- there is no spatial query in this app, only
  -- display, so a real geo type would be unused complexity.
  latitude numeric(9, 6),
  longitude numeric(9, 6),
  coordinate_label text,
  story text,
  tagline text,
  production_limit integer check (production_limit is null or production_limit > 0),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (shop_id, code)
);

create index idx_collections_shop on collections(shop_id);

create trigger trg_collections_updated_at
  before insert or update on collections
  for each row execute function set_updated_at();

alter table products
  add column collection_id text references collections(id) on delete set null;

create index idx_products_collection on products(collection_id);


alter table collections enable row level security;
create policy "shop scoped" on collections
  for all to authenticated
  using (shop_id = (select current_shop_id()))
  with check (shop_id = (select current_shop_id()));


-- ============================================================
-- Storage bucket for collection cover images -- same pattern as
-- product-images (0010_product_image_storage.sql).
-- ============================================================

insert into storage.buckets (id, name, public)
values ('collection-images', 'collection-images', true)
on conflict (id) do nothing;

-- Storage's own API (not just PostgREST) needs a SELECT policy to locate an
-- object before it will update or delete it -- a public bucket only grants
-- anonymous read of the public URL, not authenticated visibility into
-- storage.objects. Without this, an owner's own delete/replace silently
-- no-ops (see the matching fix to product-images in 0015).
create policy "collection images: shop scoped select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'collection-images'
    and (storage.foldername(name))[1] = (select current_shop_id())::text
  );

create policy "collection images: shop scoped insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'collection-images'
    and (storage.foldername(name))[1] = (select current_shop_id())::text
  );

create policy "collection images: shop scoped update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'collection-images'
    and (storage.foldername(name))[1] = (select current_shop_id())::text
  );

create policy "collection images: shop scoped delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'collection-images'
    and (storage.foldername(name))[1] = (select current_shop_id())::text
  );

commit;
