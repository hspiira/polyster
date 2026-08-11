-- Sales and expenses: money in over the counter, and money out.
--
-- Closes the gap 0005's design document listed as deferred limitation 5:
-- "No `expenses` table. A shop tracking money in but not out has half a
-- picture. That is a feature, not a schema gap, and belongs on the roadmap."
-- The first pilot shop then asked for exactly that, in these words: "Recording
-- sales + Accounting module / Track what's sold / Profits / Expense".
--
-- The same note made a sharper observation -- that the app "feels like it is
-- created for the client and not the tailor" -- and `sales` is the structural
-- answer to it. See ARCHITECTURE.md D16.
--
-- ## Why a sale is not an order
--
-- An order is commissioned work: it belongs to a client, has a due date, moves
-- through stages, carries units, and can be part-paid. All correct for a suit
-- being made, and all wrong for someone buying a ready-made shirt off the
-- rack. Recording that sale before this table meant creating a client record
-- for a stranger, inventing a pickup date for a garment being carried out of
-- the shop, and then tapping through three stages of a transaction that had
-- already finished. That is the "entering it as a client" the shop described;
-- the shape was wrong, and relabelling would not have fixed it.
--
-- So `sales.client_id` is nullable, and that nullability is the whole feature.
--
-- ## A sale is paid in full, by definition
--
-- There is no balance on a sale. Money changing hands at the counter is what
-- separates it from an order; anything part-paid is an order and belongs in
-- that table with its payment history. Keeping the line sharp is what lets the
-- profit figure count every sale row as cash received without consulting
-- `payments`, and never double-count an order that is both written up and
-- paid.
--
-- Wrapped in a transaction for the same reason 0005 is: the rollback guarantee
-- should not depend on how the file is invoked.
begin;


-- ============================================================
-- sales -- money taken at the counter, now.
-- ============================================================

create table sales (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,

  -- Nullable on purpose: a walk-in customer is not a client record, and
  -- requiring one is the friction this table exists to remove. Set null on
  -- delete rather than cascade -- archiving a client must not erase the money.
  client_id uuid references clients(id) on delete set null,

  item_description text not null check (length(trim(item_description)) > 0),
  quantity integer not null default 1 check (quantity > 0),

  -- Denormalised from the shop for the same reason orders carry it: a shop
  -- that changes currency must not silently reinterpret its own history.
  currency text not null,
  -- Minor units, like every other amount since 0005. Zero is allowed where a
  -- payment's is not: shops do give things away, and recording it at zero is
  -- more honest than not recording it.
  unit_price_minor bigint not null default 0 check (unit_price_minor >= 0),

  method text not null default 'cash'
    check (method in ('cash', 'mobile_money', 'bank', 'other')),
  reference text,

  -- When the money moved, which offline is not when it was typed in -- the
  -- same split payments make.
  sold_at timestamptz not null default now(),

  recorded_by uuid references staff(id) on delete set null,
  notes text,

  -- Void trail, matching payments. A voided sale changes a profit figure the
  -- shop may already have read, so "why is last month different now" needs an
  -- answer that is not just a missing row.
  voided_by uuid references staff(id) on delete set null,
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

comment on column sales.client_id is
  'Optional. A walk-in customer is not a client record; requiring one is the friction this table removes.';
comment on column sales.unit_price_minor is
  'Price for one unit, in minor units. Line total is quantity * unit_price_minor, derived so the two cannot disagree.';


-- ============================================================
-- expenses -- money out. Without it there is no profit, only revenue,
-- which is the half-picture 0005's design document called out.
-- ============================================================

create table expenses (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,

  -- A short fixed list, not free text. A shop typing "transport", "Transport"
  -- and "transpt" across one month cannot be grouped into a report afterwards,
  -- and the report is the entire reason to record these.
  category text not null default 'other'
    check (category in ('materials', 'rent', 'wages', 'transport', 'utilities', 'other')),
  description text not null check (length(trim(description)) > 0),

  currency text not null,
  amount_minor bigint not null check (amount_minor > 0),

  -- A date, not a timestamp: an expense belongs to a day in the books, and
  -- receipts are commonly entered the evening after they were paid.
  spent_on date not null default current_date,

  recorded_by uuid references staff(id) on delete set null,
  notes text,

  voided_by uuid references staff(id) on delete set null,
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
-- Row Level Security -- the same four rules as every other table
-- (ARCHITECTURE.md section 4). `to authenticated` so a policy never
-- silently applies to anon, and current_shop_id() wrapped in a
-- sub-select so Postgres evaluates it once per statement, not per row.
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
-- Realtime, so a sale rung up on the counter phone reaches the owner's
-- phone without a reload -- as with every other synced table.
-- ============================================================

alter publication supabase_realtime add table sales, expenses;

commit;
