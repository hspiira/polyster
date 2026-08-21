-- Sales and expenses: money in over the counter, and money out.
--
-- Closes deferred limitation 5 from the order-units design ("No expenses
-- table... belongs on the roadmap"), asked for by the first pilot shop.
--
-- A sale is not an order: no client required, no due date, no stages, and
-- paid in full by definition. `client_id` is nullable and that is the point --
-- a walk-in is not a client record. Anything part-paid is an order.
--
-- Transaction-wrapped like 0005 so the rollback does not depend on how the
-- file is invoked.
begin;


-- ============================================================
-- sales -- money taken at the counter, now.
-- ============================================================

create table sales (
  id text primary key,
  shop_id text not null references shops(id) on delete cascade,

  -- Set null, not cascade: archiving a client must not erase the money.
  client_id text references clients(id) on delete set null,

  item_description text not null check (length(trim(item_description)) > 0),
  quantity integer not null default 1 check (quantity > 0),

  -- Denormalised like orders: a currency change must not rewrite history.
  currency text not null,
  -- Zero allowed, unlike a payment: a giveaway recorded is better than none.
  unit_price_minor bigint not null default 0 check (unit_price_minor >= 0),

  method text not null default 'cash'
    check (method in ('cash', 'mobile_money', 'bank', 'other')),
  reference text,

  -- When the money moved; offline that is not when it was typed in.
  sold_at timestamptz not null default now(),

  recorded_by text references staff(id) on delete set null,
  notes text,

  -- Void trail: a void changes a profit figure the shop may already have read.
  voided_by text references staff(id) on delete set null,
  voided_at timestamptz,
  void_reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  _modified timestamptz not null default now(),
  _deleted boolean not null default false
);

create index idx_sales_shop on sales(shop_id);
-- The report's hot query: one shop's sales inside a date window.
create index idx_sales_shop_sold_at on sales(shop_id, sold_at);

create trigger trg_sales_modified
  before insert or update on sales
  for each row execute function set_modified_and_updated_at();



-- ============================================================
-- expenses -- money out. Without it there is no profit, only revenue,
-- which is the half-picture 0005's design document called out.
-- ============================================================

create table expenses (
  id text primary key,
  shop_id text not null references shops(id) on delete cascade,

  -- A short fixed list, not free text. A shop typing "transport", "Transport"
  -- and "transpt" across one month cannot be grouped into a report afterwards,
  -- and the report is the entire reason to record these.
  category text not null default 'other'
    check (category in ('materials', 'rent', 'wages', 'transport', 'utilities', 'other')),
  description text not null check (length(trim(description)) > 0),

  currency text not null,
  amount_minor bigint not null check (amount_minor > 0),

  -- A date: receipts are often entered the evening after they were paid.
  spent_on date not null default current_date,

  recorded_by text references staff(id) on delete set null,
  notes text,

  voided_by text references staff(id) on delete set null,
  voided_at timestamptz,
  void_reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  _modified timestamptz not null default now(),
  _deleted boolean not null default false
);

create index idx_expenses_shop on expenses(shop_id);
create index idx_expenses_shop_spent_on on expenses(shop_id, spent_on);

create trigger trg_expenses_modified
  before insert or update on expenses
  for each row execute function set_modified_and_updated_at();


-- ============================================================
-- RLS: same four rules as every other table (ARCHITECTURE.md section 4).
-- ============================================================

alter table sales enable row level security;
create policy "shop scoped" on sales
  for all to authenticated
  using (shop_id = (select current_shop_id()))
  with check (shop_id = (select current_shop_id()));

alter table expenses enable row level security;
create policy "shop scoped" on expenses
  for all to authenticated
  using (shop_id = (select current_shop_id()))
  with check (shop_id = (select current_shop_id()));


-- ============================================================
-- Realtime, as with every other synced table.
-- ============================================================

alter publication supabase_realtime add table sales, expenses;

commit;
