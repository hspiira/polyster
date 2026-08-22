# Sync: what it has to decide before it can be built

Date: 2026-08-22
Status: **built 2026-08-22.** Decisions taken below; see Outcome.
Decision owner: Piira

## Why this is a plan and not a commit

Replication went with RxDB on 2026-08-21 and a shop's records now live on one
device. Backup import (Phase 1) means a lost phone is no longer a lost shop, but
two devices still cannot share one.

The reason this needs a design pass rather than an afternoon is not the plumbing.
It is that **two devices editing the same order offline is a rules question**, and
a wrong rule loses work quietly — which is worse than no sync, because no sync at
least tells the truth about where the data is.

## What the schema already decided, and nobody wrote down

Six row types carry no `updated_at`: `EventDoc`, `InventoryMovement`,
`MessageLogDoc`, `PaymentDoc`, `OrderStageHistoryDoc`, `ProductionBatchCost`.

That is not an oversight. **Every one of them is append-only.** A payment is
never edited — it is voided, which stamps `voided_at` and `deleted_at` and never
reverses. A stage-history entry, a sent message, a stock movement, a cost line and
an audit event are all facts about a moment.

So the twenty-eight stores split in two, and the split matters more than anything
else here:

| | Behaviour | Conflict risk |
|---|---|---|
| **Append-only** — events, payments, order_stage_history, inventory_movements, message_log, production_batch_costs | Written once; ids are cuid2, so two devices cannot collide | **None.** Union the rows. There is nothing to reconcile. |
| **Mutable** — shops, staff, clients, orders, order_units, sales, expenses, products, materials, suppliers, inventory_items, production_batches, garment_units, collections, the taxonomies, tenant_features, measurement_* | Edited in place | Real. Needs a rule. |

**The hard problem is smaller than it looks.** Money — payments — is in the
conflict-free half. Two devices taking payments on the same order offline both
push their rows, and the union is correct: the balance is a sum, and
`recordPayment`'s cap is re-derived on read rather than stored. That is the case
most likely to happen in a real shop and it needs no conflict rule at all.

## Gaps that must close before any of this works

Found by reading the schema against the database, not assumed:

1. **Eight tables have no `_modified`** — suppliers, materials, inventory_items,
   inventory_movements, production_batches, production_batch_costs, collections,
   garment_units. Exactly the areas that were online-only until yesterday, so they
   never needed sync scaffolding. Nothing can pull them incrementally as they are.
2. **The device and the server disagree on how deletion is spelled.** Dexie uses
   `deleted_at` (a timestamp, D5); Postgres uses `_deleted` (a boolean).
3. **The device and the server disagree on how change is spelled.** Dexie rows
   carry `updated_at`, set by the repository; Postgres carries `_modified`, set by
   a trigger and deliberately not trusted from the client.
4. **The audit log cannot be the sync mechanism.** Phase 2 dropped the row payload
   from `created` events to cut the log by two-thirds. That was the right trade for
   size and it closes the operation-log option — worth stating plainly, because it
   was not stated when the trade was made.

## Decisions

### Decision A — what shape the sync takes

| Option | How | Cost |
|---|---|---|
| **A1 — row-based, last-write-wins per row** | Pull rows whose `_modified` is newer than the last pull; push rows whose `updated_at` is newer than the last push. Whole rows. | What RxDB did. Simple, proven here. A conflicting edit loses the older row **entirely**, including fields the other device did not touch. |
| **A2 — row-based, last-write-wins per field** | Same transport; merge field by field using a per-field timestamp. | No lost edits to untouched fields. Needs a timestamp per field, which is a schema change on every mutable table and a large one. |
| **A3 — append-only first** | Sync the six append-only stores now; leave mutable stores local-only until A1 or A2 is chosen. | Ships the case that matters most (money, history) with **no conflict rule at all**. Does not give two devices a shared client list. |

**My recommendation: A3 then A1.** A3 is genuinely useful on its own — two
devices, one shop, both taking payments, and the reports agree — and it carries no
risk of losing an edit because there are no edits to lose. It also builds and
proves the whole transport, auth and cursor mechanism against the easy half, which
is the part most likely to have bugs. A1 then adds mutable rows with one rule to
argue about instead of a whole system.

A2 is the correct answer for a shared client list edited by two people, and the
wrong first step: it is a schema change across twenty-one tables to solve a problem
no shop has reported.

### Decision B — one spelling for change and deletion

Whatever A is chosen, this has to be settled first, and it is a straight choice
between the device's vocabulary and the server's.

| Option | Consequence |
|---|---|
| **B1 — server adopts the device's** | `_deleted boolean` becomes `deleted_at timestamptz`, `_modified` becomes `updated_at`. One migration, and the triggers change. The 8 tables missing `_modified` get `updated_at` instead. |
| **B2 — device adopts the server's** | `deleted_at` becomes `_deleted` plus a separate timestamp. Touches the repository layer, which is the one place that currently owns soft delete cleanly. |

**My recommendation: B1.** `deleted_at` carries strictly more information than a
boolean — when, not just whether — and a purge policy needs the when. The
repository layer already treats it as the single source of soft-delete truth, and
that is the abstraction worth protecting. The cost is a Postgres migration, which
`pnpm verify:schema` can now prove.

One caveat I want to be honest about: `_modified` is set by a **trigger** and
deliberately not trusted from the client, which is a real safety property — a
device with a wrong clock cannot claim its write is newer than it is. If
`updated_at` becomes the sync cursor, that protection has to be kept explicitly
(server overwrites it on write) rather than lost by accident.

### Decision C — what happens to the audit log

The `events` store is append-only and would sync cleanly. But it is the largest
store on the device, and Phase 2 already excluded it from backups on the grounds
that it says who changed what rather than what the shop is.

| Option | Consequence |
|---|---|
| **C1 — do not sync it** | Each device keeps its own log of what happened on it. Attribution stays truthful per device; there is no shop-wide history. |
| **C2 — sync it** | One shop-wide history, at the cost of the largest table crossing the wire. |
| **C3 — push only** | The server accumulates the whole history; devices keep only their own. Reports could read it server-side later. |

**My recommendation: C3.** It is the only option that makes a shop-wide history
possible without every device carrying every other device's log. It also makes the
server the durable home of the audit trail, which is where it belongs if the
point is that a lost phone loses nothing.

### Decision D — what happens when a device has been offline for a long time

Not a conflict question, a volume one. A device offline for a month comes back
with a large push and needs a large pull.

Recommendation, low confidence and easy to change later: page both directions with
a cursor, cap a batch, and make the first sync after a long gap resumable rather
than one transaction. **I have not measured this** and the numbers in
`2026-08-22-durability-and-gaps.md` are in-memory Node figures, so I would not
design around them.

## What is still unanswered, and I am not going to pretend otherwise

- **Two devices, one account.** Auth today is one shared login per shop
  (`ARCHITECTURE.md` §4), so two devices are the same Supabase user. That makes
  sync straightforward and means the server cannot tell them apart. If per-device
  identity is wanted — "which phone recorded this" — that is an auth change, not a
  sync feature.
- **Self-service shop creation** (D14) still has no reconciliation if a device
  creates a shop locally while its account has an admin-provisioned one. Sync makes
  this reachable rather than theoretical. It needs its own answer.
- **Whether a shop actually wants two devices.** Everything above assumes yes. If
  the real requirement is only "my work survives losing my phone", Phase 1 already
  delivered that, and this whole plan is worth less than the accessibility pass.

## Proposed sequence, once B is settled

1. **B** — one spelling, one migration, proved by `verify:schema`.
2. **`updated_at` on the eight tables that lack it**, same migration.
3. **Transport** — auth, cursor storage, push and pull for **one** append-only
   store, end to end, two real devices.
4. **The rest of the append-only stores** — mechanical once 3 works.
5. **Stop. Measure. Decide A1 vs A2 with evidence** about whether concurrent edits
   to mutable rows actually happen.

Steps 1 and 2 are small and unblock everything. Step 3 is where the real work and
the real surprises are. I would not commit to a date past step 3 before it exists.

## Outcome

Built the same day, all of it: every store, both directions.

**Decisions as taken**, which differ from the recommendations above in two places:

| | Recommended | Taken | Why the change |
|---|---|---|---|
| A | Append-only first, then row-level | **All stores at once, row-level** | "No shortcuts" — shipping half of sync and deciding later is the thing that was rejected. |
| B | Server adopts `updated_at`, dropping `_modified` | **Both kept** | The recommendation was wrong. Collapsing them breaks the pull cursor: a row written offline Monday and pushed Friday carries Monday's `updated_at`, and a device that pulled Wednesday must still receive it. Client time orders edits; server time drives the cursor. |
| C | Audit log push-only | **Pushed and pulled like anything else** | Uniformity was worth more than the saving. One code path, no special case, and a shop-wide history falls out for free. |
| D | Paged and resumable | **Batched at 500 a pull, 200 a push** | Still unmeasured against a real device. |

**What the conflict rule costs, stated plainly.** Two devices editing the same
row at once loses the older edit rather than merging it field by field.
Per-field would need a timestamp per column on twenty-one tables plus a
server-side merge. The case that actually happens in a shop — two devices taking
payments on one order — is append-only and conflict-free either way.

**What is proved, and how.** 86 tests over the rules against a fake server, with
eight mutation checks. The SQL semantics against a local Postgres: a partial
update leaving other columns untouched, the guard declining a stale write, a
newer write to a different field landing beside it, and tenant isolation across
nine tables with two accounts — that last one closing a gap `verify-rls.mjs`
names as beyond it. The outbox filling and collapsing, in a browser.

**What is not proved.** No real Supabase project, no real login, and no second
device. Everything above says the rules are right; none of it says the round trip
works against Supabase's own API, its auth, or its rate limits. That is the next
thing, and it needs credentials rather than code.
