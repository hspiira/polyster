# Order units, per-unit measurements, and a schema pass -- design

Date: 2026-08-01
Status: approved, not implemented
Scope: the order model, measurement capture, and every table in the schema.

The concrete tables, columns, constraints and invariants live in
[`2026-08-01-order-units-and-schema-pass-model.md`](2026-08-01-order-units-and-schema-pass-model.md).
That document is normative for *what the schema is*. This one records *why*, and
what has to change around it.


## Where this sits

`2026-07-31-internal-ia-today-design.md` planned four screen specs, of which S2
covers `Orders`, `OrderDetail` and `OrderForm`. This spec is not S2 and does not
replace it. It changes the data model those three screens sit on, which means it
has to land first: designing the visual treatment of an order form before knowing
whether an order has one price or five would be designing against a guess.

S2 remains the visual and interaction design. This spec defines the shape, the
write layer, and the migration, and specifies screen changes only to the extent
that the new shape forces them.


## The problem

An order is currently flat. One `client_id`, one `item_description`, one
`price_total`, one `stage`, one `pickup_due_date`. Measurements are one profile
per client, enforced by a unique constraint.

That model cannot express the ordinary case it was built for. A client who comes
in with cloth for three members of her household has one visit, one pickup, and
one balance, but three garments at three prices with three different sets of
measurements. Today the shop either creates three unrelated orders, which
fragments the balance and the pickup, or creates one and loses everything except
a single free-text line and a single total.

The client's own measurement profile makes it worse. Recording her son's chest
measurement means overwriting hers.


## Decisions

| # | Decision | Chosen | Rejected | Why |
|---|---|---|---|---|
| O1 | Order shape | Header plus `order_units` child rows | Keeping orders flat; one order per garment | One visit is one balance and one pickup. Fragmenting that across orders makes both unanswerable. |
| O2 | Stage granularity | Stage on the order, plus a per-unit `done` tick | Stage per unit with a derived rollup | Pickup is a single event, so a single stage is truthful. The tick gives the tailor what they actually need, which is "what is left", without touching the stage machine, `order_stage_history`, or the Today dashboard. |
| O3 | Whose measurements | Frozen snapshot on the unit, free-text `wearer_name` | Named profiles per client; a `people` table | Beneficiaries are not customers. Making them records adds a table, an RLS policy, and screens to serve a repeat order that may never come. A repeat order copies from the previous one. |
| O4 | Order total | Sum of units plus one order-level adjustment | Sum only; quantity times unit price | A haggled discount recorded by editing a unit's price down corrupts the price history that next year's quote is built on. The adjustment keeps per-unit prices honest and gives the client a line they understand. |
| O5 | Where the total lives | `price_total_minor` as a cache, rebuilt by one function | Deriving it on every read | RxDB has no join. Deriving it means loading every unit of every visible order to render the Orders list, which is the most-opened screen. |
| O6 | Same-day orders | The form offers to add to an existing open order with the same pickup date | No prompt; a hard rule | The rule is "one order per pickup event". Taught in the flow it gets followed; written in a document it does not. Enforced hard, it removes legitimate cases such as two jobs for one client paid by different people. |
| O7 | Money representation | Integer minor units end to end, `_minor` suffixed | `numeric(12,2)` with float conversion | Three representations of one quantity exist today: `numeric(12,2)`, a JS float, and hundredths inside `balances.ts`. One is enough. |
| O8 | Order reference | `DDMM-XXXXX`, Crockford base32, device-generated, indexed but not unique | A server sequence; a unique constraint with retry | A sequence needs coordination and the app must work offline. A unique constraint converts a rare cosmetic collision into a rejected push, and a wedged sync queue on a device holding a week of offline work is the worse failure. |
| O9 | Cancellation and refunds | `cancelled` stage, and `payments.kind` of `payment` or `refund` | Soft-deleting abandoned orders | A soft-deleted order leaves the reports entirely rather than recording that it was cancelled, and a refund could only be expressed by deleting a payment that genuinely happened. |
| O10 | Retiring a measurement field | `active = false` | Continuing to soft-delete | Soft-deleting hides every value already recorded against the field. See the bug below. |

### On O3, which was the closest call

Named profiles per client were recommended during design review and rejected in
favour of the snapshot. The recommendation's argument was repeat business: a
second kanzu for the same son means retyping his measurements. The counter-argument
won on scope, and it holds up, because named profiles remain addable later without
changing the unit's shape. The unit would gain an optional `profile_id` and keep
the snapshot it already carries.

Recorded because the reasoning is worth having if repeat orders turn out to be
more common than assumed.


## A bug this pass fixes

`removeMeasurementField` in `writes.ts` soft-deletes the field. RxDB excludes
soft-deleted documents from query results, and `ClientDetail` renders its form
from `measurement_fields.find(...)`, so a retired field disappears from every
screen. The value survives in `measurement_profiles.values`, keyed by an id
nothing can now resolve to a label.

The comment at `writes.ts:137` states the opposite: "a client's recorded chest
measurement should not vanish because the shop tidied its field list". Intent and
behaviour disagree, and the behaviour wins. `active` (O10) makes the comment true.


## The write layer

`writes.ts` is the file that makes O5 safe. Its existing premise -- every write in
one place, so the easy-to-forget things cannot be forgotten in one screen and
remembered in another -- is exactly what a maintained cache needs.

```
recalculateOrder(orderId)
  rebuilds  price_total_minor = sum(active units) + price_adjustment_minor
            summary           = derived from the same units
            updated_at

  called by  addOrderUnit  updateOrderUnit  removeOrderUnit
             reorderOrderUnits  setOrderAdjustment
```

No other code path may set `price_total_minor` or `summary`. That is invariant 1
in the model, and it is a test rather than a convention.

Other changes:

- `createOrder` takes a header and an array of units, and writes the order, its
  units, and the opening history row. The existing ordering rule holds: the
  history row is written before the state it describes (D13).
- `removeOrderUnit` refuses to remove the last remaining unit.
- `changeOrderStage` additionally stamps `picked_up_at`, `returned_at` or
  `cancelled_at` as the destination stage requires.
- `recordPayment` gains `kind` and `reference`; `voidPayment` records
  `voided_by`, `voided_at` and `void_reason`.
- `retireMeasurementField` replaces `removeMeasurementField`.
- New: `copyMeasurementsFromClient(unitId)`, `saveUnitMeasurementsToClient(unitId)`,
  `logMessage(...)`.

Neither measurement action ever fires automatically, and both buttons name the
client, so a unit entered for Junior cannot overwrite his mother's profile by
reflex.


## Screens

Only what the new shape forces. Visual design remains S2's.

**`OrderForm`** becomes a header plus a unit editor. Each unit carries
description, optional wearer, price, fabric source, measurements, and notes. The
header carries client, type, dates, adjustment and notes. On choosing a client
who already has an open order with the same pickup date, the form asks once
whether to add to it or start a separate order, and staff keep the final say (O6).

**`OrderDetail`** gains the unit list with its done ticks, and a money block that
shows subtotal, adjustment with its reason, total, paid, and balance as separate
lines. A rental deposit is shown apart from the balance, because it is held rather
than earned. Where a reminder has been sent it says so, with when and by whom, and
it says "reminder sent" rather than "client notified", because a `wa.me` link
hands off to WhatsApp and the app never learns what happened next.

**`ClientDetail`** renders active fields for entry, and shows retired fields
read-only where the client has a value recorded against them.

**`Settings`** gains currency and lock timeout under shop details, and field type,
group and retire under measurement fields.


## Migration

One Postgres migration, `0005_order_units_and_schema_pass.sql`, in this order:

```
add columns  ->  create order_units, message_log  ->  backfill units
->  convert money to _minor  ->  drop superseded columns
->  replace order_balances  ->  RLS policies  ->  realtime publication  ->  indexes
```

The RxDB side bumps every touched collection and writes a real strategy for each.
The maps exist today but are empty, so this is the first change that exercises
them, and `database.test.ts` already has the both-directions test pattern to
extend.

**The unit backfill cannot happen inside an RxDB strategy.** A strategy runs per
document within one collection and cannot insert into another. Postgres backfills
server-side; a device holding unsynced offline orders runs a one-shot repair after
`addCollections`.

Both must not create the unit twice, so the backfilled unit takes its order's own
id as its primary key. Server and device independently arrive at the same key,
which makes a duplicate impossible by construction rather than by ordering luck.


## Testing

- `recalculateOrder` holds invariant 1 across add, edit, remove, reorder and
  adjustment, including an adjustment that would drive a total negative.
- `removeOrderUnit` refuses the last unit.
- Reference generator: format, alphabet, and that it never emits I, L, O or U.
- Money round-trips minor to display and back at exponent 0 and exponent 2.
- Balance with an adjustment, with a refund, with a soft-deleted payment, and
  with a rental deposit that must not appear in it.
- RxDB opens a database written at the old version and reads it at the new one,
  both directions, per the existing pattern.
- The backfill is idempotent: running it twice, and running it against an order
  whose unit already arrived by replication, produces one unit.
- A retired measurement field still resolves its label for a recorded value.


## Limitations carried forward deliberately

- `order_type` stays on the header, so a visit that is half rental and half
  purchase becomes two orders.
- Conflict resolution remains untested (ARCHITECTURE section 11), and this pass
  widens the surface: two devices editing different units of one order both
  recalculate the total and will disagree. Invariant 1 makes the correct value
  recomputable from the units, so the repair is well defined, but it is not
  written here.
- The currency exponent is read from `Intl.NumberFormat(...).resolvedOptions()`
  and **is unverified on the target handsets**. ISO 4217 lists UGX with a zero
  minor unit and CLDR generally follows it, but that is an assumption about ICU
  data, not a measurement. An explicit exponent map is the fallback.
- Backfill rounds `numeric(12,2)` to whole units at exponent 0, losing at most
  0.99 UGX per affected row. Nothing has run on real hardware, so this most
  likely touches development data only.
- No `expenses` table. A shop tracking money in but not out has half a picture,
  but that is a feature rather than a schema gap.
- `message_log` records intent to send, never delivery.
- Beneficiaries are not records (O3), so a repeat order for the same person
  copies measurements rather than linking to them.
