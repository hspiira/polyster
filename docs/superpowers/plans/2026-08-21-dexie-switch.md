# Switch storage from RxDB to Dexie

Date: 2026-08-21
Status: **done** (all six phases; see Outcome)
Decision owner: Piira

## Why

RxDB's open-source build caps **globally open collections at 13**
(`NON_PREMIUM_COLLECTION_LIMIT`, counted across every open database, not per
database). Measured: it opens 14 and throws `COL23` on the next. Polyster has
exactly 13.

That ceiling has already been paid for. Eleven screens — Catalogue,
CatalogueDetail, Collections, GarmentUnits, Inventory, InventoryItemDetail,
Materials, Production, ProductionBatchDetail, Suppliers, AdvancedReports — are
`useOnlineFeature` and read Supabase directly through `src/online/`. They do not
work without a signal, in an app whose landing screen reads *"Take orders and
payments even with no signal."*

IndexedDB has no such cap. Probed in Chromium: 500 object stores with indexes in
one database, a write/read round trip on the last one, and an atomic transaction
across three stores. Dexie 4.4.2 is already in the tree as RxDB's own storage
adapter, and ships `liveQuery`.

## Decisions taken

| # | Decision | Rejected | Why |
|---|---|---|---|
| D1 | Straight cut to Dexie | A `RepositoryBundle` interface with both backends behind it | Explicit: "no in between". A dual-backend layer is a second thing to keep correct, for a swap that happens once. |
| D2 | Every collection local | Keep the eleven feature areas online-only | The premise is offline-first. Nothing here is big: rows are small and images are URLs, not bytes. |
| D3 | Images stay remote | Cache image bytes locally | `image_url` is a URL. The record is local and useful offline; the picture is not. Caching bytes is a separate decision with a real size cost. |
| D4 | Replication is not ported | Rebuild it as part of the switch | It is deterministically broken today for object-typed columns (below), and a real design needs an account model first. Backup/restore covers the gap. |
| D6 | One append-only `events` store | Per-table `updated_by` columns | There is no general audit today: `order_stage_history` covers one event type, nine of eighteen schema modules carry no attribution, and twenty of forty-one writes never take a staffId. Roles shipped in Phase 12 without a log. |
| D7 | `expense_categories` and `material_types` become tables | Keep them as closed enums | `measurement_fields` and `product_categories` already work this way. The constants seed a new shop rather than capping it. |
| D8 | Ids are cuid2 | Keep uuid v4 | 24 url-safe characters against 36, no timestamp leaked, and no central authority for a device offline for days. |
| D5 | Soft delete becomes explicit | Keep an RxDB-shaped `_deleted` | Dexie has no soft-delete semantics. `deleted_at` on the row, filtered in the repository layer, not at 98 call sites. |

## What is actually being replaced

Measured, not estimated.

| RxDB feature | Usage in polyster | Replacement |
|---|---|---|
| Reactive queries | 79 `.$` observables, 148 `useRxQuery` calls, 30 screens | Dexie `liveQuery`. `useRxQuery` is one hook; its body changes, its signature does not. |
| Query selectors | 98 `selector:` | Most are one indexed field (`shop_id`, `order_id`, `client_id`). `$ne`/`$nin` become in-memory filters after the index lookup. |
| `doc.patch()` | 27 | `table.update(id, patch)` |
| `doc.remove()` | 23 | `table.update(id, { deleted_at })` (D5) |
| `doc.toJSON()` | 86 | Nothing. Dexie returns plain objects. |
| Schema migrations | 13 strategy maps, 11 versioned schemas | Dexie `version(n).stores(...).upgrade(...)`. One place, no per-collection version bookkeeping, no schema-hash mismatch (`DB6`). |
| Schema validation | dev-mode ajv | Zod at the write boundary. `src/db/writes/` is already the only way in. |
| Cross-collection transaction | **does not exist** — `writes.ts` orders writes to work around it | Gained: `db.transaction('rw', ...)` across stores. |

## The 27 stores after the switch

The 13 already local, the 11 tables `src/online/` reads, and 3 new (D6, D7):

`events` · `expense_categories` · `material_types`


`products` · `product_variants` · `product_categories` · `collections` ·
`garment_units` · `inventory_items` · `inventory_movements` · `materials` ·
`production_batches` · `production_batch_costs` · `suppliers`

`src/online/analytics.ts` needs no table — it composes the others, so it starts
working offline the moment they are local.

**Size review, per D2.** Every one of these is small rows with no blobs.
`inventory_movements` and `events` are the two unbounded ledgers, and a row of
either is a couple of hundred bytes -- a hundred events a day is roughly 7MB a
year against an IndexedDB quota in the hundreds of MB. Local, and a prune path
is a later decision rather than a blocker.

## Phases

Each phase ends green on `pnpm verify` and is committed on its own.

### Phase 1 — the Dexie database, beside RxDB, unused

`src/db/dexie/schema.ts` declaring all 24 stores and their indexes, and
`src/db/dexie/database.ts` opening it. Nothing reads it yet. Tests assert the
store list matches the collection list, the way `replication.test.ts` already
guards `REPLICATED_TABLES`.

### Phase 2 — one-time import from the RxDB stores

RxDB-on-Dexie writes each collection into its **own IndexedDB database**, named
`rxdb-dexie-tailor_tracker--<schemaVersion>--<collection>`. Current versions:
shops 3, staff 5, clients 1, measurement_fields 1, measurement_profiles 1,
orders 3, payments 1, order_stage_history 2, order_units 0, sales 2, expenses 1,
message_log 1, tenant_features 0.

So the import is readable: open each, copy rows, drop `_meta`/`_rev`/`_attachments`,
map `_deleted: true` to `deleted_at`. It runs once, is idempotent, and leaves the
old databases in place until a later release deletes them.

**This is the phase that can lose a shop's data, so it is the one that gets
property-based tests** and a dry run that reports counts before writing.

### Phase 3 — repository layer

`src/db/repo/` per aggregate, mirroring `src/db/writes/`. Every read and write
goes through it; `deleted_at` filtering lives here and nowhere else. Reads return
plain objects, so `.toJSON()` disappears from call sites rather than being
reimplemented.

### Phase 4 — `useRxQuery` becomes `useQuery`

One hook, backed by `liveQuery`. Same signature, so the 148 call sites change
their import and nothing else. This is the phase that proves the reactive story
holds, and it is where a regression would be most visible — verify by driving
real screens, not only by tests.

### Phase 5 — cut over and delete RxDB

`src/db/database.ts`, `schema/`, `writes/`, `replication.ts` and the `rxdb`
dependency all go. `backup.ts` re-points at the repository layer; its existing
"covers every table" test becomes the guard that all 24 are exported.

### Phase 6 — bring the eleven areas local, as we go

Per D2, and per "the others can be done as we go": one feature area at a time,
`src/online/x.ts` becoming `src/db/repo/x.ts`, `useOnlineFeature` dropping off
the screen. Independent of each other, so they can land in any order.

## Risks

**A big-bang cutover has no A/B.** That is the accepted cost of D1. Phase 2's
import is the mitigation that matters: while the old RxDB databases still exist,
a bad release is recoverable by reverting the code.

**cuid2 finishes what D4 started, sooner than D4 did.** Postgres rejects a
non-uuid string in a `uuid` column, so from the cuid2 commit onward no new row
can push at all -- where before it was only rows carrying an object-typed field.
D4 already accepted losing replication; this makes the loss immediate rather
than at Phase 5, and it means Phase 5 must not be left half-finished.

**Replication is not being ported (D4).** Today it is already broken for
`order_units.measurements`, `measurement_profiles.values` and
`staff.permission_overrides` — `addDocEqualityToQuery` cannot build an
optimistic-concurrency check for a plain object, which per POLYSTER.md "fires on
every single order created through the form". Dropping it is giving up something
that does not work for the most common write. But it does work for rows without
object fields, so a shop syncing today would stop syncing. That needs saying out
loud before Phase 5 ships, and `BackupSettings` needs to be the answer.

**`liveQuery` semantics are not RxDB's.** RxDB re-emits on any change to a
matching document. `liveQuery` re-runs the whole query on any change to a table
it touched. That is coarser and could re-render more than before. Measure on
Today, which holds the most live queries, before assuming it is fine.

## Verification

- `pnpm verify` green at every phase.
- Phase 2 gets a property test: a generated shop of arbitrary size imports with
  no row lost and no row duplicated.
- Phases 4 and 6 get a real browser pass per the `run-polyster` skill — both
  shells, both themes, and one write-then-observe on each screen that changed.
- A dedicated check that the app opens, registers a shop and takes an order with
  the network switched off, which is the claim the whole switch exists to make
  true.

## Outcome

All six phases shipped on 2026-08-21. `pnpm verify` green: 697 tests, standards
clean, production build passing. `rxdb` and `rxjs` are out of `package.json`.

| Phase | What landed |
|---|---|
| 1 | 27 stores, typed table by table, `deleted_at` as the soft delete |
| 2 | Import off the old RxDB databases, property-tested |
| 3 | `src/db/repo/` — audited writes, live reads, one module per aggregate |
| 4 | 148 call sites swapped; `useRxQuery` became `useQuery` |
| 5 | `writes/`, `database.ts`, `replication.ts`, `features.ts` and the RxDB JSON schemas deleted |
| 6 | All eleven online-only areas local; `useOnlineFeature` deleted |

Net effect on the tree: the switch itself added code, Phase 6 removed 1,546
lines more than it added.

### What the risks turned out to be

**`liveQuery` re-render cost — measured, not a problem.** The worry was that
`liveQuery` re-runs a whole query where RxDB re-emitted per document. On Today,
which holds the most live queries, against a seeded shop of 60 orders, 74
payments, 45 sales, 35 expenses and 652 events:

- figures on screen 133 ms after navigation, three runs within 1 ms of each other
- an order written in 18 ms
- visible in the DOM within the same frame

Coarser than RxDB, and it does not matter at a shop's data volume.

**The offline claim, verified.** Production build, service worker installed,
then the network made genuinely unreachable — proven with a cross-origin fetch
at every step, because `navigator.onLine` goes stale after a navigation under
Playwright's offline emulation and a same-origin probe is answered by the
service worker. With no network the app set up a shop, added a client, created
an order and recorded a payment: 8 rows plus 8 audit events on disk, no
application errors.

**Replication is gone and that is the open wound.** D4 accepted it; the cuid2
commit made it immediate. A shop's data now lives on one device with a backup
file as the only way off. This is recorded in ARCHITECTURE.md section 11 as the
largest open item, together with what rebuilding it needs first: either the
Postgres id columns become `text`, or ids go back to uuid.

**Two things the server used to do moved into the client, and are better for
it.** A stock movement and the balance it moves are now one Dexie transaction
rather than an insert plus a trigger; SKU uniqueness is an explicit check rather
than a constraint violation translated after the fact. Both are covered by
tests that fail when the guard is removed.

### What stayed remote, deliberately

`src/online/` is down to two modules. Image upload, because a photo is a URL the
shop shares rather than megabytes on a phone (D3), now bounded by a 30-second
timeout. And the garment passport, because it is read by anonymous visitors and
that Postgres function is the whole security boundary.
