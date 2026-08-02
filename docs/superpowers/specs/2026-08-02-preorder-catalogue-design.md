# Pre-order catalogue (minimal) — design

Date: 2026-08-02
Status: proposed
Scope: a size/SKU dimension for fixed-run pre-order campaigns (e.g. a 50-unit apparel drop), scoped down from the deferred Phase 2 catalogue module.

## Why

A conversation about whether the NORTH//FOUND brand concept could run its first pre-order campaign through Polyster surfaced a real gap. Polyster's order model was built for a tailoring shop's walk-in, made-to-measure clients — one client, one bespoke garment, no notion of "which size" or "how many of this SKU are left." A pre-order campaign is the opposite shape: many buyers, a small fixed set of size/colour variants, and a hard question the current schema cannot answer — *how many of each size have sold against the 50 committed*.

This is not the full Phase 2 catalogue module (`docs/pwa-schema-and-screens.md` §4, `docs/IMPLEMENTATION_PLAN.md` Phase 2). That module includes rental date-range availability and item photos — both genuinely deferred, both unneeded for a single fixed-run drop. This design is the minimum slice that makes "43 of 50 sold, by size" a query instead of a hand count.

## What's already there

Checked against the current code, not assumed:

- **`OrderUnitDoc.catalogue_item_id` already exists**, optional, unwritten — reserved exactly for this (`src/db/schema.ts:328`). No schema change needed on the order side to *carry* the link.
- **The snapshot pattern already exists.** `createOrder` already copies `item_description` and `price_total_minor` onto the order unit at creation time (`src/db/writes.ts:184-239`) — the same pattern a catalogue item's name/price would follow: read once at order time, frozen after.
- **`fabric_source: 'shop'` is already `createOrder`'s default** for every unit it creates. This is not a gap — my earlier framing overstated it. A pre-order unit gets `'shop'` for free, no change required.
- **Client-side derived counts already exist as the house pattern.** Balances are computed from replicated payments client-side, not read from a Postgres view (D9) — the same approach fits a per-SKU sold count.
- **Migrations with real strategies already exist.** `src/db/database.ts` carries `migrationStrategies` for every collection that has been bumped past `version: 0`, each one tested (`ordersStrategies`, `paymentsStrategies`, etc., exercised in `database.test.ts`). `docs/ARCHITECTURE.md` §11 states "no RxDB schema migration strategy yet" — **that line is stale**; it should be corrected when this or any future schema work lands, since it no longer describes the code.

## Decisions

| # | Decision | Rejected | Why |
|---|---|---|---|
| P1 | One `catalogue_items` collection, one row per SKU (product × colour × size) | A nested variant matrix (one product row with a variants array) | Matches D8's already-settled model: "shops typically hold multiples of the same design/size... the catalogue tracks item types with a quantity count, not individual physical garments." One row per sellable unit is simpler to query and matches how `order_units` already snapshots a single description. |
| P2 | `quantity_target` is optional and advisory, not decremented stock | A live `quantity_remaining` counter, written down on each sale | A written-down counter is exactly the two-staff-both-see-"2 left" race (see Risks). An advisory target plus a derived count is honest about what a client-side, eventually-consistent system can actually guarantee. |
| P3 | Sold count is a derived client-side query, not a stored field | Storing `quantity_sold` on `catalogue_items`, updated on every order write | Same precedent as D9 (balances computed, not stored). A stored counter needs an atomic increment RxDB does not offer across documents (ARCHITECTURE.md's stated reason for D13's "history row written first, accept non-atomicity" already establishes there is no cross-collection transaction here). |
| P4 | Size and colour live in one free-text `variant` field, not split into separate typed fields | Separate `size` (enum) and `colour` (string) fields | A pre-order drop's variant set is decided per-campaign, not fixed app-wide (a shop selling suits doesn't share a size enum with a shop selling shirts). Free text matches how `item_description` already works elsewhere in this schema. Revisit if a shop ever needs to query "all Larges across every product," which nothing today asks for. |
| P5 | No RLS/availability logic beyond the existing four-rule pattern already used for every other table | A dedicated "reserve while checking out" hold mechanism | There is no checkout flow — orders are staff-entered, one at a time, from behind the PIN gate, same as every other order type. Reservation/hold logic is what the deferred rental-availability engine solves for; it doesn't apply here. |

## Data model

```ts
export interface CatalogueItemDoc {
  id: string
  shop_id: string
  name: string                 // "Heavyweight Tee"
  variant?: string              // "Bone / L" -- free text, see P4
  price_minor: number
  quantity_target?: number      // advisory only, see P2 -- absent means uncapped
  active: boolean                // retiring a variant, same convention as measurement_fields.active
  created_at: string
  updated_at: string
}
export const catalogueItemSchema: RxJsonSchema<CatalogueItemDoc> = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: uuidField,
    shop_id: uuidField,
    name: { type: 'string' },
    variant: { type: 'string' },
    price_minor: { type: 'integer', minimum: 0 },
    quantity_target: { type: 'integer', minimum: 0 },
    active: { type: 'boolean' },
    created_at: { type: 'string', format: 'date-time' },
    updated_at: { type: 'string', format: 'date-time' },
  },
  required: ['id', 'shop_id', 'name', 'price_minor', 'active'],
  indexes: ['shop_id'],
}
```

`OrderUnitDoc` needs no field changes — `catalogue_item_id` already exists. It needs to start being *written*: `createOrder`/`createOrderUnit` accept an optional `catalogueItemId`, and when present, look up the catalogue item and snapshot its `name`/`variant` into `item_description` and its `price_minor` into the unit's `price_minor`, exactly as free-text entry does today.

## Sold-count query

```ts
/** Non-cancelled units against a catalogue item. Derived, never stored — see P3. */
export function soldCountByItem(db: AppDatabase, shopId: string): Observable<Record<string, number>>
```

Implementation: join `order_units` (filtered to `catalogue_item_id` set) against `orders` (filtered to `shop_id` and `stage !== 'cancelled'`), grouped and counted client-side, the same shape as the existing balance computation in `src/db/balances.ts`.

## Order flow

No new `order_type`. A pre-order unit is `order_type: 'purchase'`, stage flow `measured → ready → picked_up` (unchanged, `src/screens/orderStage.ts`). The stage label `'measured'` reads oddly as "order taken" for a pre-set size rather than a literal measurement — a copy-only concern, not a data-model one; out of scope here, worth a follow-up if this ships.

## Migrations

New table, additive only — no existing migration or collection changes. Follows the four-rule RLS pattern every other table already uses (`supabase/migrations/0001_init.sql` §"1. Every policy names `to authenticated`" through §4), scoped to `select`/`insert`/`update` for the authenticated shop via `current_shop_id()`, no `delete` (matches `shops`' own policy: retire via `active`, not deletion). Added to `REPLICATED_TABLES` in `src/db/replication.ts` and `Collections` in `src/db/database.ts`, with an empty `migrationStrategies: {}` at `version: 0` per the established pattern (`src/db/database.ts`'s own header comment: "add the matching strategy here in the same commit" the day this bumps past v0).

## Risks

**The last-few-units race is real and not solved here (P2/P3).** Two staff on two offline phones can both see "2 of 50 left" and both sell the last size before either syncs. This is the same category of risk `ARCHITECTURE.md` §11 already accepts for simultaneous offline edits generally — named here rather than hidden, and not a blocker for a shop willing to oversell by a unit or two and sort it out by phone, which is the realistic failure mode at this volume.

**`ARCHITECTURE.md` §11's migration-strategy line is stale** and should be corrected in the same change that adds this table, independent of whether this design ships — it currently misdescribes code that has moved on.

## Deferred (explicitly out of scope)

- Item photos and Supabase Storage wiring.
- Rental date-range availability (`quantity_total` minus overlapping active rentals) — this table has no rental use at all; `catalogue_items` here only ever backs `purchase` orders.
- A catalogue management screen in Settings. For a single campaign, seeding the handful of `catalogue_items` rows is a one-time task-sized job, not a UI.
- Multi-campaign / multi-drop management, waitlists, or a public storefront. Orders are still staff-entered from behind the PIN gate.

## Testing

- **Unit, new:** `soldCountByItem` — empty catalogue, one item with no orders, one item at/over `quantity_target`, cancelled orders excluded from the count.
- **Unit, existing pattern:** a migration-strategy test for `catalogue_items` once (if) it ever bumps past v0, per `database.test.ts`'s existing convention.
- **No screen-level testing plan yet** — this design has no UI attached (see Deferred); if a minimal "add catalogue item" affordance is built, it inherits the entry-flow work's stated gap (screen behaviour has no automated coverage) rather than closing it.
