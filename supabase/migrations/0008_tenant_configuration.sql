-- Tenant configuration: business type + presentation fields on shops, and
-- per-shop feature flags. See docs/POLYSTER.md sections 7-9.
begin;

alter table shops
  add column business_type text
    check (business_type in ('tailor', 'rental', 'apparel_brand', 'corporate_supplier', 'hybrid')),
  add column logo_url text,
  add column timezone text,
  add column email text,
  add column website text;


-- ============================================================
-- tenant_features
-- ============================================================

create table tenant_features (
  id text primary key,
  shop_id text not null references shops(id) on delete cascade,
  feature_key text not null,
  enabled boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  _modified timestamptz not null default now(),
  _deleted boolean not null default false,

  unique (shop_id, feature_key)
);

create index idx_tenant_features_shop on tenant_features(shop_id);

create trigger trg_tenant_features_modified
  before insert or update on tenant_features
  for each row execute function set_modified_and_updated_at();

alter table tenant_features enable row level security;
create policy "shop scoped" on tenant_features
  for all to authenticated
  using (shop_id = (select current_shop_id()))
  with check (shop_id = (select current_shop_id()));

alter publication supabase_realtime add table tenant_features;

commit;
