# Pre-order catalogue (minimal) — design

Date: 2026-08-02
Status: proposed
Revised: 2026-08-02 after self-review — see "What the first draft got wrong".
Scope: a size/SKU dimension for fixed-run pre-order campaigns (e.g. a 50-unit apparel drop), scoped down from the deferred Phase 2 catalogue module.

## Why

A conversation about whether the NORTH//FOUND brand concept could run its first pre-order campaign through Polyster surfaced a real gap. Polyster's order model was built for a tailoring shop's walk-in, made-to-measure clients — one client, one bespoke garment, no notion of "which size" or "how many of this variant are left." A pre-order campaign is the opposite shape: many buyers, a small fixed set of size/colour variants, one production run, and a hard question the current schema cannot answer — *how many of each size have sold against the 50 committed*.

This is not the full Phase 2 catalogue module (`POLYSTER.md` §73). That module includes rental date-range availability and item photos — both genuinely deferred, both unneeded for a fixed-run drop.

## What the first draft got wrong

Recorded rather than quietly corrected, because two of these changed the design's shape.

1. **`quantity_target` was on the wrong entity.** A run is "30–50 pieces total across M/L/XL/XXL", not a per-size quota. Putting the target on each variant row forces the owner to split 50 across four sizes up front — which is the opposite of what a pre-order is for, since the whole point is producing to observed demand. Fixed by introducing a run entity (C1 below).
2. **The missing production stage was understated.** `purchase`'s stage flow is `measured → ready → picked_up` (`src/screens/orderStage.ts:54`) — no `in_progress`. A pre-order's defining feature is a production lead time between "ordered" and "ready". The first draft called this "a copy-only concern"; it is a modelling gap. Addressed in C2.
3. **Factual error:** the draft said "matches `shops`' own policy: retire via `active`". `shops` has no `active` column — that convention comes from `staff` and `measurement_fields`.
4. **Omission:** the draft specified `REPLICATED_TABLES` and `Collections` but not the Postgres Realtime publication, which `0005` explicitly joins its new tables to. Without it live sync never fires for the new tables.
5. **Omission:** cross-tenant referencing of `catalogue_item_id` was not addressed. Now a named risk.
6. **The query signature missed the house pattern.** `balances.ts` splits a pure `calculateBalance` from an observable `observeBalance`; only the observable was specified, which is the half that cannot be tested in this project's node-environment vitest setup.

## What's already there

Verified against source, not assumed:

- **`OrderUnitDoc.catalogue_item_id` already exists**, optional and unwritten (`src/db/schema.ts:328`) — reserved for exactly this. No new field needed on the order side to carry the link.
- **The snapshot pattern already exists.** `createOrder` copies the description and price onto the order unit at creation (`src/db/writes.ts`), the same way `measurements` and `currency` are frozen at write time.
- **`fabric_source: 'shop'` is already the default** every unit `createOrder` writes gets. No change needed; the field is simply inert for a pre-cut garment.
- **Client-side derived figures are the house pattern** (D9: balances computed from replicated rows, not read from the `order_balances` view, because a view read is a network call on the most offline-critical screen).
- **Migrations with real, tested strategies already exist** (`src/db/database.ts`, exercised in `database.test.ts`). `docs/ARCHITECTURE.md` §11 still says "No RxDB schema migration strategy yet. Every collection is `version: 0`" — **that line is stale** and should be corrected independently of whether this design ships.

## Decisions

| # | Decision | Rejected | Why |
|---|---|---|---|
| C1 | Two collections: `catalogue_runs` (the campaign) and `catalogue_items` (one row per variant within it) | One `catalogue_items` table carrying `quantity_target` per variant | A target of 50 belongs to the run, not to "Bone / L". One table forced an arbitrary up-front split across sizes, defeating produce-to-demand. Two small tables model it correctly and are still far short of Phase 2's full module. |
| C2 | A new `order_type: 'preorder'`, flow `measured → in_progress → ready → picked_up` | Reusing `purchase`; reusing `tailor_made`; adding `in_progress` to `purchase` | `purchase` means buying from existing stock, which genuinely has no production step — adding `in_progress` to it would misdescribe every real purchase order. `tailor_made` implies measurements. The cost is real and stated below. |
| C3 | Sold count is derived client-side, never a stored counter | `quantity_sold` on the run or variant, incremented per order | Same precedent as D9. A stored counter needs an atomic cross-collection increment RxDB does not offer — the same constraint that forced D13's "write the history row first, accept non-atomicity". |
| C4 | Variant is one free-text field, not typed `size` + `colour` | Separate typed fields, or a size enum | A run's variant set is decided per campaign, not fixed app-wide — a shop selling suits shares no size enum with one selling shirts. Matches how `item_description` already works. Revisit if anything ever needs "all Larges across every run", which nothing does today. |
| C5 | `target_total` is advisory, never enforced as stock | Blocking an order once the target is reached | Enforcement implies a reservation the offline model cannot honour (see Risks). An advisory number plus a live count is honest about what an eventually-consistent client can guarantee. |
| C6 | No photos, no rental availability, no management UI | Building the Phase 2 module | Out of scope. Seeding a handful of rows for one campaign is a task, not a screen. |

## Data model

```ts
/** One production run / drop. The target lives here, not on a variant -- C1. */
export interface CatalogueRunDoc {
  id: string
  shop_id: string
  name: string                  // "Heavyweight Tee -- first drop"
  target_total?: number          // advisory, C5. Absent means uncapped.
  active: boolean
  created_at: string
  updated_at: string
}

/** One sellable variant within a run. */
export interface CatalogueItemDoc {
  id: string
  shop_id: string                // denormalised from the run so RLS and indexes match every other table
  run_id: string
  variant: string                // "Bone / L" -- free text, C4
  price_minor: number
  active: boolean
  created_at: string
  updated_at: string
}
```

Both at `version: 0` with an empty `migrationStrategies: {}`, per the pattern `src/db/database.ts`'s header establishes. Both indexed on `shop_id`; `catalogue_items` additionally on `run_id`.

`OrderUnitDoc` needs no field change — `catalogue_item_id` already exists and simply starts being written. When present, the order-writing path snapshots the run name + variant into `item_description` and the variant's `price_minor` into the unit's price, exactly as free-text entry does today.

## Sold count

Matching `balances.ts`'s split (finding 6): a pure function that takes rows, plus a thin observable that feeds it.

```ts
export interface RunTally {
  run_id: string
  target_total?: number
  sold_total: number
  /** Keyed by catalogue_items.id. */
  sold_by_item: Record<string, number>
}

/** Pure. Given a run, its variants, and the units sold against them, what has gone. */
export function tallyRun(
  run: Pick<CatalogueRunDoc, 'id' | 'target_total'>,
  items: readonly Pick<CatalogueItemDoc, 'id'>[],
  units: readonly Pick<OrderUnitDoc, 'catalogue_item_id'>[],
): RunTally

/** Live tally, re-emitting on any local write or replicated change. */
export function observeRunTally(db: AppDatabase, runId: string): Observable<RunTally | null>
```

The observable is a `combineLatest` over the run, its items, and the order units referencing them — the same shape as `observeBalance`. Cancelled orders must be excluded, which needs the units joined back to their orders (units carry only `order_id`, not `stage`); soft-deleted rows are excluded by RxDB automatically, as `balances.ts` documents.

## Migrations

Two new tables, additive only, no changes to existing collections. Each carries:

- `shop_id` with the same RLS shape every other tenant table uses — a policy naming `to authenticated`, scoped through `current_shop_id()` (`supabase/migrations/0001_init.sql` §"Four implementation rules").
- `select`/`insert`/`update` only, no `delete` — retirement is `active = false`, the convention `staff` and `measurement_fields` already use (**not** `shops`, which has no such column).
- `_modified` / `_deleted` columns and the `before insert or update` trigger, as every replicated table has.
- **Membership in the `supabase_realtime` publication** (finding 4), the way `0005` adds its own new tables. Omitting this is silent: replication's initial pull works and live updates never arrive.

Then `Collections` in `src/db/database.ts` and `REPLICATED_TABLES` in `src/db/replication.ts`.

`order_type` gains `'preorder'` (C2), which is not additive-only: it touches the `orders` check constraint in Postgres, the `ORDER_TYPES` array and `OrderType` union in `src/db/schema.ts`, `FLOWS` and `ORDER_TYPE_LABELS` in `src/screens/orderStage.ts`, and any exhaustive switch over the union. No RxDB schema `version` bump is required — the enum is a value constraint, not a shape change — but the Postgres constraint must be widened *before* any client can push a `preorder` row, or the push fails server-side while the local write succeeds.

## Risks

**Overselling the last units is real and unsolved (C5).** Two staff on two offline devices can both see "2 of 50 left" and both sell the last one. This is the same class of risk `ARCHITECTURE.md` §11 already accepts for concurrent offline edits — named here rather than hidden, and tolerable at this volume, where the recovery is a phone call. It is *not* tolerable if enforcement is ever added on top of it without a server-side check.

**Cross-tenant references are unguarded (finding 5).** A foreign key from `order_units.catalogue_item_id` to `catalogue_items(id)` is not filtered by RLS — FK validation does not run policies. Another shop's item cannot be *read* (so nothing leaks) but could be *referenced*. Mitigation, if wanted: a trigger asserting the referenced item's `shop_id` matches the order's. Worth naming because this codebase has already been bitten by precisely this class of assumption once — correction C3 in `ARCHITECTURE.md` §10, the view that silently ran as its owner.

**`'measured'` as the opening stage reads wrong** for a pre-set size. Renaming a stage is an enum change across the schema, the SQL constraint, the label map, and existing rows' history — deliberately not bundled here.

## Deferred

- Item photos and Supabase Storage wiring.
- Rental date-range availability. These tables never back a rental.
- A catalogue management screen. One campaign is a seeding task.
- Multi-run reporting, waitlists, a public storefront. Orders stay staff-entered from behind the PIN gate.

## Testing

- **Unit, new (pure):** `tallyRun` — no items; items with no orders; a run at and over `target_total`; units whose order is cancelled excluded; a unit pointing at a retired (`active: false`) variant still counted, since it was genuinely sold.
- **Unit, existing convention:** a migration test once either collection bumps past `version: 0`, per `database.test.ts`.
- **Not covered:** the observable half, and any UI. Screen behaviour still has no automated coverage in this project (`ARCHITECTURE.md` §11); this design does not close that gap and should not be read as doing so.
