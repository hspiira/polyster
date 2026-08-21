# Switch storage from RxDB to Dexie

Date: 2026-08-21
Status: approved, not started
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

## The 24 collections after the switch

The 13 already local, plus the 11 tables `src/online/` reads:

`products` · `product_variants` · `product_categories` · `collections` ·
`garment_units` · `inventory_items` · `inventory_movements` · `materials` ·
`production_batches` · `production_batch_costs` · `suppliers`

`src/online/analytics.ts` needs no table — it composes the others, so it starts
working offline the moment they are local.

**Size review, per D2.** Every one of these is small rows with no blobs.
`inventory_movements` is the only unbounded ledger and a movement is one short
row. Nothing here justifies staying remote.

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
