# Order units and schema pass -- data model

**Status:** Draft, under review. Not approved, not implemented.
**Date:** 2026-08-01
**Supersedes nothing yet.** Becomes the data-model section of the design spec once agreed.

This document is the concrete model only: tables, columns, types, constraints, and
the invariants that hold them together. Rationale for each decision lives in the
design spec that will wrap it. Where this document and `ARCHITECTURE.md` disagree,
this one is a proposal and that one is the current state.


## 1. A worked example

One visit. Mrs. Okello brings cloth for her son, orders a gomesi for her daughter,
and buys a shirt for her husband. All three are collected on 12 August.

```
ORDER  1208-K7M2Q          Mrs. Okello           tailor_made
       stage in_progress   due 12 Aug 2026       currency UGX

  #  item                wearer   fabric   done      price
  1  Kanzu, navy         Junior   client   [x]      45,000
  2  Gomesi, gold trim   Sarah    shop     [ ]      80,000
  3  Shirt, white        Paul     shop     [x]      30,000
                                                  ---------
                                      Subtotal     155,000
                                      Discount      -5,000   "regular customer"
                                      Total        150,000
                                      Paid          50,000
                                      Balance      100,000

  Unit 1 measurements   chest 72, waist 60, length 140   (snapshot)
  Reminder sent 2 days ago by Grace
```

Stored as:

| Row | Table | Key values |
|---|---|---|
| 1 | `orders` | `reference '1208-K7M2Q'`, `price_total_minor 150000`, `price_adjustment_minor -5000`, `summary 'Kanzu +2'` (invariant 3) |
| 3 | `order_units` | `price_minor` 45000 / 80000 / 30000, `position` 0 / 1 / 2 |
| 1 | `payments` | `amount_minor 50000`, `kind 'payment'` |
| 1 | `order_stage_history` | opening row, `to_stage 'measured'` |
| 1 | `message_log` | `template 'balance_reminder'` |

`price_total_minor` is a cache. Its authority is the invariant in section 7, not
the column itself.


## 2. Entity map

```
shops ─┬─ staff
       ├─ clients ─┬─ measurement_profiles   (one per client)
       │           ├─ orders ─┬─ order_units          NEW
       │           │          ├─ payments
       │           │          └─ order_stage_history
       │           └─ message_log                     NEW
       └─ measurement_fields

order_units.measurements  and  measurement_profiles.values
  are both jsonb keyed by measurement_fields.id, same shape.
  The unit holds a frozen snapshot; the profile holds the client's current numbers.
```


## 3. New table: `order_units`

```sql
create table order_units (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  position integer not null default 0,

  -- Null means "for the client themselves". Free text by design: beneficiaries
  -- are not records, so a repeat order for Junior copies rather than links.
  wearer_name text,
  item_description text not null check (length(trim(item_description)) > 0),
  price_minor bigint not null default 0 check (price_minor >= 0),

  -- Frozen snapshot, keyed by measurement_fields.id. Editing the client's
  -- profile later must never rewrite this.
  measurements jsonb not null default '{}'::jsonb,

  fabric_source text not null default 'shop'
    check (fabric_source in ('client', 'shop')),
  done boolean not null default false,

  catalogue_item_id uuid,  -- Phase 2. Moved off orders; no FK until that table exists.
  photo_url text,          -- Phase 2 Supabase Storage. Reserved, unwritten.

  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  _modified timestamptz not null default now(),
  _deleted boolean not null default false
);

create index idx_order_units_order on order_units(order_id, position);

create trigger trg_order_units_modified
  before insert or update on order_units
  for each row execute function set_modified_and_updated_at();
```

RLS scopes through `orders`, the pattern `payments` already uses:

```sql
alter table order_units enable row level security;
create policy "shop scoped via order" on order_units
  for all to authenticated
  using (exists (select 1 from orders o
                 where o.id = order_units.order_id
                   and o.shop_id = (select current_shop_id())))
  with check (exists (select 1 from orders o
                      where o.id = order_units.order_id
                        and o.shop_id = (select current_shop_id())));
```

**"At least one unit per order" is not a database constraint.** A cross-table
check cannot be written practically here, and it would fire during replication
anyway, when an order row and its unit rows arrive as separate statements. It is
enforced in `writes.ts`: `removeOrderUnit` refuses to remove the last one.


## 4. New table: `message_log`

```sql
create table message_log (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  order_id uuid references orders(id) on delete cascade,  -- null: not about an order

  channel text not null default 'whatsapp'
    check (channel in ('whatsapp', 'sms', 'call')),

  -- Deliberately not the stage enum. suggestedMessage() in whatsapp.ts switches
  -- on stage, but duplicating that enum here would mean extending two lists
  -- every time a stage is added. The stage is recorded alongside instead.
  template text not null
    check (template in ('stage_update', 'balance_reminder', 'custom')),
  order_stage text,

  sent_at timestamptz not null default now(),
  sent_by uuid references staff(id) on delete set null,
  _modified timestamptz not null default now(),
  _deleted boolean not null default false
);

create index idx_message_log_order on message_log(order_id, sent_at);
create index idx_message_log_client on message_log(client_id, sent_at);
```

RLS scopes through `clients`, not `orders`, because `order_id` is nullable and
`client_id` is not.

**This records intent to send, not delivery.** A `wa.me` link hands off to
WhatsApp and the app never learns what happened next. The UI must say "reminder
sent", never "client was notified".


## 5. Changes to existing tables

### `shops`

| Column | Type | Note |
|---|---|---|
| `updated_at` | `timestamptz not null default now()` | trigger switches to `set_modified_and_updated_at()` |
| `currency` | `text not null default 'UGX'` | ISO 4217. Snapshotted onto each order at creation. |
| `country` | `text not null default 'UG'` | ISO 3166-1 alpha-2. Replaces the hardcoded `'256'` default in `toWaNumber`. |
| `address` | `text` | receipt header |
| `lock_after_minutes` | `integer not null default 5 check (lock_after_minutes >= 0)` | 0 means never. Replaces the `DEFAULT_LOCK_AFTER_MINUTES` constant as the source of truth. |

`last_backup_at` stays in `localStorage` and is deliberately **not** a column. A
backup is a file on one device; a backup taken on the owner's phone does not
protect unsynced work on the counter tablet. Per-device is the correct scope.

### `staff`

| Column | Type | Note |
|---|---|---|
| `updated_at` | `timestamptz not null default now()` | |
| `phone` | `text` | |
| `pin_updated_at` | `timestamptz` | a PIN reset currently leaves no trace |
| `deactivated_at` | `timestamptz` | `active` records that someone left, never when |

`role` stays `owner | staff`. Roles are not a security boundary (D4), so more of
them would be decoration.

### `clients`

| Column | Type | Note |
|---|---|---|
| `updated_at` | `timestamptz not null default now()` | |
| `created_by` | `uuid references staff(id) on delete set null` | matches `orders.created_by` |

```sql
create index idx_clients_shop_phone on clients(shop_id, phone);
```

Phone is normalized to E.164 on write via `lib/phone.ts`. **No unique constraint.**
Family members sharing one handset is normal here, so uniqueness would be wrong.
The app warns "a client with this number already exists" and staff decide.

### `measurement_fields`

| Column | Type | Note |
|---|---|---|
| `created_at` | `timestamptz not null default now()` | |
| `updated_at` | `timestamptz not null default now()` | |
| `field_type` | `text not null default 'number' check (field_type in ('number','text'))` | a chest measurement cannot be saved as "blue" |
| `group_label` | `text` | display grouping only, no logic |
| `active` | `boolean not null default true` | |

`active` fixes a live bug. `removeMeasurementField` soft-deletes, and RxDB
excludes `_deleted` documents from query results, so `ClientDetail` (which renders
the form from `measurement_fields.find(...)`) stops showing the field. The value
survives in the jsonb and nothing can display it -- the opposite of what the
comment in `writes.ts` claims. Retiring now sets `active = false`; `_deleted`
returns to meaning genuinely deleted.

### `measurement_profiles`

| Column | Type | Note |
|---|---|---|
| `created_at` | `timestamptz not null default now()` | |

Keeps its one-per-client unique constraint and keeps reaching `shop_id` through
`clients` in RLS. No measurement history table: per-order snapshots now record how
a client's numbers changed over time, tied to the garment each produced.

### `orders`

| Column | Change |
|---|---|
| `item_description` | renamed `summary`, becomes a derived cache. Also touches `whatsapp.ts:51`. |
| `price_total` | becomes `price_total_minor bigint not null default 0 check (price_total_minor >= 0)` |
| `catalogue_item_id` | moved to `order_units` |
| `reference` | new, `text not null`, `DDMM-XXXXX`. Added nullable, backfilled from each row's `created_at` for `DDMM` plus a generated suffix, then set `not null`. Adding it `not null` in one step fails on any existing row. |
| `currency` | new, `text not null default 'UGX'`, snapshot of the shop's at creation |
| `price_adjustment_minor` | new, `bigint not null default 0`. May be negative. |
| `adjustment_reason` | new, `text` |
| `rental_deposit_minor` | new, `bigint not null default 0 check (>= 0)`. Held, refundable, **excluded from `price_total_minor` and from the balance.** |
| `deposit_refunded_at` | new, `timestamptz` |
| `picked_up_at` | new, `timestamptz` |
| `returned_at` | new, `timestamptz` |
| `cancelled_at` | new, `timestamptz` |
| `cancellation_reason` | new, `text` |
| `stage` | check gains `'cancelled'` |

```sql
create index idx_orders_shop_reference on orders(shop_id, reference);
```

No unique constraint on `(shop_id, reference)`. About 33.5 million codes per shop
per day; a 50-order day carries roughly a 0.004% chance of a repeat, and roughly
1.4% across a year of such days (approximate figures). A unique constraint would
turn that rare cosmetic collision into a rejected replication push, and a wedged
sync queue on a device holding a week of offline work is the worse outcome.

Late and damage fees get no columns. They are a positive `price_adjustment_minor`
with a reason, which is what they are.

### `payments`

| Column | Change |
|---|---|
| `amount` | becomes `amount_minor bigint not null check (amount_minor > 0)` |
| `kind` | new, `text not null default 'payment' check (kind in ('payment','refund'))` |
| `created_at` | new, `timestamptz not null default now()` |
| `reference` | new, `text`. Mobile-money transaction id, for statement reconciliation. |
| `voided_by` | new, `uuid references staff(id) on delete set null` |
| `voided_at` | new, `timestamptz` |
| `void_reason` | new, `text` |

`amount_minor > 0` holds for both kinds. A refund is a positive row with
`kind = 'refund'`, not a negative payment, which keeps the existing rule that
mistakes are voided rather than cancelled out.

`payment_date` is when the money moved. `created_at` is when it was typed in.
Cash taken Friday and entered Monday from an offline device is two facts, and
only one of them was stored.

### `order_stage_history`

| Column | Change |
|---|---|
| `note` | new, `text`. "Client asked us to hold it." |
| `from_stage` / `to_stage` | checks gain `'cancelled'` |


## 6. RxDB side

New and changed document types:

```ts
export type FabricSource = 'client' | 'shop'

export interface OrderUnitDoc {
  id: string
  order_id: string
  position: number
  wearer_name?: string
  item_description: string
  price_minor: number
  measurements: Record<string, string | number>
  fabric_source: FabricSource
  done: boolean
  catalogue_item_id?: string
  photo_url?: string
  notes?: string
  created_at: string
  updated_at: string
}

export type PaymentKind = 'payment' | 'refund'
export type MessageTemplate = 'stage_update' | 'balance_reminder' | 'custom'

// OrderStage gains 'cancelled'.
```

Money fields are `{ type: 'integer' }`, not `number`. If any becomes indexed later
it will also need `minimum`/`maximum`/`multipleOf`, which RxDB requires on indexed
numbers.

Collection versions, every one with a real strategy rather than the empty maps
that exist today:

```
shops                 1 -> 2      orders               0 -> 1
staff                 2 -> 3      payments             0 -> 1
clients               0 -> 1      order_stage_history  0 -> 1
measurement_fields    0 -> 1      order_units          0   (new)
measurement_profiles  0 -> 1      message_log          0   (new)
```

**RxDB cannot backfill the units.** A migration strategy runs per document within
one collection and cannot insert into another. Postgres backfills server-side; a
device holding unsynced offline orders needs a one-shot local repair after
`addCollections`.

Both must not create the unit twice, so **the backfilled unit reuses the order's
own id as its primary key.** Server and device independently generate the same
key, making a duplicate impossible by construction rather than by ordering luck.


## 7. Invariants

These are the statements the implementation must keep true. Each is a test.

1. `orders.price_total_minor = sum(active units.price_minor) + price_adjustment_minor`
   Maintained only by `recalculateOrder(orderId)`, which every unit and adjustment
   write funnels through.
2. `orders.price_total_minor >= 0`. An adjustment cannot drive a total negative.
3. `orders.summary` is derived from the same units in the same call, as the first
   unit's `item_description` up to the first comma, plus ` +N` when further units
   exist. Three units described "Kanzu, navy" / "Gomesi, gold trim" / "Shirt,
   white" give `Kanzu +2`. Defined precisely because it is a cache, and two call
   sites computing it differently is the failure mode a cache invites.
4. Every order has at least one non-deleted unit, enforced in `writes.ts`.
5. `rental_deposit_minor` never enters `price_total_minor` or any balance.
6. `balance = sum(payments where kind='payment') - sum(payments where kind='refund') `
   subtracted from `price_total_minor`, soft-deleted rows excluded, computed in
   integers throughout.
7. A unit's `measurements` never changes as a result of editing a client's profile.
8. A backfilled unit's id equals its order's id.


## 8. The `order_balances` view

```sql
create or replace view order_balances
with (security_invoker = on) as
select
  o.id as order_id,
  o.shop_id,
  o.stage,
  o.price_total_minor,
  coalesce(u.units_subtotal_minor, 0) as units_subtotal_minor,
  coalesce(p.paid_minor, 0) as amount_paid_minor,
  o.price_total_minor - coalesce(p.paid_minor, 0) as balance_minor
from orders o
left join lateral (
  select sum(ou.price_minor) as units_subtotal_minor
  from order_units ou
  where ou.order_id = o.id and ou._deleted = false
) u on true
left join lateral (
  select sum(case when pm.kind = 'refund' then -pm.amount_minor
                  else pm.amount_minor end) as paid_minor
  from payments pm
  where pm.order_id = o.id and pm._deleted = false
) p on true
where o._deleted = false;
```

`security_invoker = on` is carried forward and remains load-bearing
(ARCHITECTURE section 4, rule 2).

`units_subtotal_minor` is exposed so server-side reporting can detect cache drift
(invariant 1) without putting a "these numbers disagree" state in front of shop
staff who cannot act on it.

Cancelled orders are **not** filtered here. The view reports a raw balance; the
decision to exclude cancelled work belongs to the report query, where it is
visible.


## 9. Open items and uncertainties

1. **Currency exponent.** The plan reads it from
   `Intl.NumberFormat(locale, { style: 'currency', currency }).resolvedOptions().maximumFractionDigits`
   rather than a hand-maintained table. ISO 4217 lists UGX with a zero minor unit
   and CLDR generally follows it, but **this is an assumption about ICU data on the
   target handsets and must be verified there.** If it returns 2, the fallback is
   an explicit exponent map. Nothing else in the model changes either way.
2. **Backfill rounding.** `price_total numeric(12,2)` converts as
   `round(price_total)` at exponent 0, losing at most 0.99 UGX on any row carrying
   decimals. Per ARCHITECTURE section 11 nothing has run on real hardware, so this
   most likely touches development data only. The migration is written to be
   correct regardless.
3. **Conflict resolution remains untested** (ARCHITECTURE section 11). This model
   adds child rows to orders, which widens the surface: two devices editing
   different units of one order both recalculate `price_total_minor` and will
   disagree. Invariant 1 makes the correct value recomputable from the units, so
   the repair is well defined, but it is not written yet and is not in this
   document's scope.
4. **`order_type` stays on the order header.** A visit that is half rental and
   half purchase becomes two orders. Recorded as a deliberate limitation.
5. **No `expenses` table.** A shop tracking money in but not out has half a
   picture. That is a feature, not a schema gap, and belongs on the roadmap.
