-- Production batches and costing (Phase 5). Online-only per
-- docs/POLYSTER.md section 46.1.
begin;

create table production_batches (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,

  batch_number text not null check (length(trim(batch_number)) > 0),
  planned_quantity integer not null default 0 check (planned_quantity >= 0),
  produced_quantity integer not null default 0 check (produced_quantity >= 0),
  accepted_quantity integer not null default 0 check (accepted_quantity >= 0),
  rejected_quantity integer not null default 0 check (rejected_quantity >= 0),

  status text not null default 'planned'
    check (status in ('planned', 'materials_ready', 'in_production', 'quality_control', 'completed', 'cancelled')),

  started_at timestamptz,
  completed_at timestamptz,
  notes text,
  -- Auditability (section 64): QC needs who/when/accepted-or-rejected/why.
  -- who is created_by below, when is updated_at, accepted/rejected are the
  -- quantity columns above; this is the why.
  rejected_reason text,

  created_by uuid references staff(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint production_batches_accepted_plus_rejected_within_produced
    check (accepted_quantity + rejected_quantity <= produced_quantity),

  unique (shop_id, batch_number)
);

create index idx_production_batches_shop on production_batches(shop_id);
create index idx_production_batches_product on production_batches(product_id);

create trigger trg_production_batches_updated_at
  before insert or update on production_batches
  for each row execute function set_updated_at();


create table production_batch_costs (
  id uuid primary key default gen_random_uuid(),
  -- Denormalised from production_batches.shop_id (docs/POLYSTER.md section
  -- 65) so RLS doesn't need a join.
  shop_id uuid not null references shops(id) on delete cascade,
  batch_id uuid not null references production_batches(id) on delete cascade,

  cost_type text not null default 'other'
    check (cost_type in ('materials', 'labour', 'transport', 'packaging', 'labels', 'quality_control', 'other')),
  description text,
  amount_minor bigint not null check (amount_minor >= 0),
  currency text not null default 'UGX',
  created_at timestamptz not null default now()
);

create index idx_production_batch_costs_shop on production_batch_costs(shop_id);
create index idx_production_batch_costs_batch on production_batch_costs(batch_id);


-- ============================================================
-- Row Level Security
-- ============================================================

alter table production_batches enable row level security;
create policy "shop scoped" on production_batches
  for all to authenticated
  using (shop_id = (select current_shop_id()))
  with check (shop_id = (select current_shop_id()));

alter table production_batch_costs enable row level security;
create policy "shop scoped" on production_batch_costs
  for all to authenticated
  using (shop_id = (select current_shop_id()))
  with check (shop_id = (select current_shop_id()));

commit;
