# Durability, and the gaps left after the storage switch

Date: 2026-08-22
Status: **in progress** — Phases 0, 1 and 2 done; Decision 1 is the gate
Decision owner: Piira

## Why

Every numbered phase in `POLYSTER.md` has shipped. What is open is not features:
it is that a shop's records now exist in exactly one place and cannot leave it.

Replication went with RxDB on 2026-08-21. `buildBackup` writes a JSON file and
nothing reads one back. So a lost phone is a lost shop, and that is true of the
live Cloudflare deployment today, not of some future state.

Two things surfaced while planning this that were not recorded anywhere, both
created by the switch itself:

- The audit log is **8.7× the size of the data it describes**, and nothing
  prunes it.
- The RxDB importer runs on **every boot, forever**, with no record that it has
  already finished and no cleanup of what it read.

## Measurements this plan rests on

Against the volume fixtures (60 orders, 74 payments — about one month):

| | |
|---|---|
| Events written | 652 — **10.9 per order** |
| Audit log | 418 KB |
| Orders + payments | 48 KB |
| Audit vs. data | **8.7×** |

Synthesised to five years (3,600 orders, 39,600 events):

| Query | Time | Rows |
|---|---|---|
| Orders by shop | 16 ms | 3,600 |
| Every payment (Reports) | 7 ms | 3,600 |
| Shop balances | 30 ms | 3,600 |
| **Events by shop** | **316 ms** | 39,600 |
| **Audit log on disk** | **11.6 MB** | — |

**These are a floor, not a prediction.** They were taken in Node against
`fake-indexeddb`, which is in-memory. A real phone reads from disk, and a
low-end Android is materially slower. What the numbers establish is the *shape*:
ordinary reads stay cheap as data grows, and the audit log does not.

Two things ruled out rather than assumed:

- **Multi-tab is fine.** Dexie 4.4.2 propagates changes over `BroadcastChannel`,
  so `liveQuery` already updates a second tab. No work needed.
- **Reports is correctly scoped** despite `payments` having no `shop_id`. It
  joins through the shop's own orders, so another shop's payments on the same
  device are filtered out. This is a scale and sync-payload concern, not a
  correctness bug.

## Decisions needed before Phase 3

### Decision 1 — what ids are, and it blocks sync

Ids are cuid2. There are **113 `uuid` references** across the 20 files in
`supabase/migrations`, and Postgres rejects a non-uuid in a `uuid` column. Sync
cannot be rebuilt until this is settled.

| Option | Cost | Consequence |
|---|---|---|
| **A** — `uuid` columns become `text` | One migration altering column types and every foreign key that references them | Keeps cuid2. Loses uuid validation at the database. Touches every table and the RLS policies that join on these columns. |
| **B** — ids go back to uuid v4 | `newId()` returns `crypto.randomUUID()`; existing local rows need their ids rewritten, or those shops never sync | Server schema, RLS policies and `garment_passport()` are untouched. |

**I recommend B, and I want to correct the record on why.** `ARCHITECTURE.md`
D8 justifies cuid2 as "24 url-safe characters against 36, no timestamp leaked,
and no central authority for a device offline for days." Two of those three are
not advantages over **uuid v4** specifically: v4 is fully random, so it leaks no
timestamp either, and it needs no central authority either. Those arguments hold
against uuid v1/v7, not against what this project would actually revert to. What
genuinely remains is that cuid2 ids are shorter.

Twelve characters per id is not worth a schema-wide column-type migration and
losing database-level validation. B is the cheaper and more conservative option,
and it was chosen on a rationale that does not survive being written out.

**The question I cannot answer from the repo:** are there shops with real data
on the live deployment? Deployed since 2026-08-15, and cuid2 landed 2026-08-21.
If nobody has data worth keeping, B is a one-line change. If someone does, B
needs a local id-rewrite pass (Phase 3a below), which is real work but bounded —
rewrite every primary key and every reference in one Dexie transaction.

### Decision 2 — what the audit log keeps

Currently every event stores the **complete row, before and after**. That is
what produces 8.7×.

| Option | Keeps | Cost |
|---|---|---|
| **A** — changed fields only | What actually changed, per event | Small diff helper in `base.ts`. Loses the ability to reconstruct a row's full state at a point in time without replaying from creation. |
| **B** — retention window | Everything, for N months | One purge on open. Older history is simply gone. |
| **C** — both | Changed fields, and purge beyond a window | More code, smallest footprint. |

**I recommend A.** It cuts the dominant cost without ever discarding history,
which matters because the log's purpose is attribution — "who marked this
ready" — and that answer should not expire. B can be added later if A alone is
not enough; A cannot be added later without a backfill.

### Decision 3 — soft delete's justification is currently void

`archiveClient`, `voidPayment` and the rest mark rows `deleted_at` rather than
removing them, and the reason recorded in D5 is "other devices may not have
synced yet." There are no other devices. Until sync returns, every soft-deleted
row is pure storage cost with no reader.

**Recommendation: keep it, unchanged.** It costs little, and Phase 3 makes the
rationale true again. Worth stating explicitly so nobody mistakes it for an
oversight — but it does need a purge policy once sync exists, which Phase 3
carries rather than this decision.

## Phases

Ordered by dependency, then by value. Each is independently shippable and leaves
`pnpm verify` green.

### Phase 0 — Hygiene (half a day)

My own debris from yesterday's codemod, and one guard that should exist.

1. **Four broken method chains.** The `.toJSON()` removal left a stray blank
   line mid-chain in `Reports.tsx:83`, `Money.tsx:105`,
   `ExpensesPage.tsx:30`, `ReportsPage.tsx:58`. Valid code, reads like a mistake.
2. **A guard test for the Dexie schema version.** `STATUS.md` carries "adding a
   store or an index needs a `version(2).stores(...)` in the same commit, or an
   installed app cannot open its own database" as a known hazard with nothing
   enforcing it. A test that pins the store list against a committed snapshot
   turns a silent break into a failed build. This is the cheapest item here and
   the one with the worst failure mode.
3. ~~`STATUS.md` lists `pnpm verify:sync`~~ — checked, it does not. I had that
   from an older `package.json` and asserted it without looking. Nothing to fix.

*Verified by:* `pnpm verify`; the guard failing when a store changes without a
version bump, and again when the version is bumped without a history entry.

**Done 2026-08-22.** The guard is a fingerprint per shipped version in
`stores.ts`, written out rather than computed — computing it would agree with any
change and guard nothing. Store names were already pinned; indexes were not, so
adding `shop_id` to `payments` in Phase 3b would have passed every test.

### Phase 1 — Backup import (1–2 days)

Closes the data-loss hole. No open questions, no dependencies — which is why it
comes before sync rather than after.

- `parseBackup(json)` — pure, total, and the risky half: version check, unknown
  stores rejected rather than dropped silently, row shape validated per store.
- `restoreBackup(db, backup, mode)` where mode is `replace` or `merge`.
  `replace` is the honest default for a lost phone; `merge` needs a conflict
  rule and should not be built until sync forces one.
- A restore screen next to the existing export, worded as destructive, behind a
  confirm that names what will be overwritten.
- Round-trip property test: seed → export → wipe → import → the database is
  equal by store counts and row contents.

*Verified by:* 21 parse tests and 5 restore tests; six mutation checks; a real
browser walk — seed three tenants, export through the button, clear every store,
restore, and every count matches.

**Done 2026-08-22.** Two things the plan did not anticipate:

- **The restore screen was unreachable in the only case it exists for.** A wiped
  device has no shop, so the app renders the entry flow and Settings cannot be
  reached. Restore is now on the landing screen too, sharing one component.
- **The atomicity test passed against a broken implementation.** It exported the
  device, restored it unchanged, and so could not tell a partial restore from a
  whole one. Removing the transaction did not fail it. Rewritten so the file
  differs from the device; the mutation now fails.

The confirmation dialog lists `events: 652` as the largest single number in a
60-order shop, which is Phase 2 arguing for itself.

### Phase 2 — Audit log and importer footprint (1 day)

Independent of sync, and cheaper to do before the log is in a year of backups.

- Store **changed fields only** (Decision 2A). Expected to cut 8.7× to roughly
  1–2×; will be re-measured rather than claimed.
- Exclude `events` from the backup by default, or make it opt-in. Right now the
  audit log is the bulk of every backup file a shop downloads.
- **Importer completion marker.** Record that the RxDB import finished and skip
  it on later boots. Today it enumerates `indexedDB.databases()` and re-opens up
  to 14 databases on every launch, forever, including for users who never had
  RxDB.
- **Delete the RxDB databases** after a verified import, so the space is
  actually reclaimed.
- An index or a bounded default on `observeShopEvents` — 316 ms at five years,
  in-memory, is the one read that does not stay cheap.

*Verified by:* re-running the measurements; seven importer tests with three
mutation checks.

**Done 2026-08-22.** Measured, not claimed:

| | Before | After |
|---|---|---|
| Audit vs. data | 8.7× | **2.84×** |
| Bytes per event | 641 | **231** |
| Events per order | 10.9 | **10.0** |
| Backup file, 60 orders | 269 KB | **136 KB** |

Three changes, and one finding that shaped them. A `created` event no longer
copies the row and a `deleted` one no longer copies what was there, because soft
delete means the row is still in its store — the log needs to say who and when,
not hold a second copy. An update stores only the fields that differ. And 51 of
168 updates recorded nothing but a bumped `updated_at`, which is a write rather
than a change, so those write no event at all.

What is left is mostly envelope: id, shop, timestamp, entity, action. 2.84× is
close to the floor without giving up either the index or the attribution, so
Decision 2B — a retention window — stays available but is not needed yet.

The importer now records that it finished, skips discovery on later launches, and
deletes the databases it read. It refuses to mark itself done if any row was
unusable, so a partial transfer is retried rather than stranded.

### Phase 3 — Sync (the large one)

Blocked on Decision 1. Should not start until Phases 1 and 2 have shipped,
because a backup importer is the fallback for sync going wrong.

- **3a — id migration**, per Decision 1. If live data exists, a one-time local
  rewrite of every primary key and reference inside one transaction, with a
  property test proving no reference is orphaned.
- **3b — `shop_id` on `payments`.** Needed to scope a sync payload per shop, and
  it removes the join-through-orders workaround Reports carries today.
- **3c — the push/pull loop.** Design not settled and deliberately not sketched
  here; it needs its own plan once Decision 1 is made. The offline-conflict
  question returns with it and is still unanswered.
- **3d — a purge policy for soft-deleted rows**, once there is a reconciliation
  horizon to purge against.

*Verified by:* two devices, one shop, changes made on both — by hand, on real
hardware, as part of Phase 4.

### Phase 4 — Real hardware (1 day, needs devices)

Nothing has ever run on a physical phone. Every screen has been driven headless
at phone dimensions, which *simulates* a phone.

- Install on Android and on iPhone. iOS installs differently
  (`ARCHITECTURE.md` §8) and is the one more likely to surprise.
- Airplane mode: take an order, record a payment, move stock, close a batch.
  This is the claim the landing screen makes and it has never been tested on a
  device that can actually lose signal.
- **Measure the PIN cost where it matters.** `DEFAULT_ITERATIONS` is 210,000,
  scaled from a desktop timing. `measureHashMs` and `recommendIterations` are
  already wired behind `import.meta.env.DEV`, so this is `pnpm dev --host`
  opened on the lowest-end handset available — minutes of work, never done.
- Re-take the Phase 2 timings on the device. The numbers in this document are a
  floor and should not be quoted as phone performance.

*Verified by:* an artifact in the repo — screenshots and the measured iteration
count — rather than a sign-off.

### Phase 5 — Accessibility tail (1 day)

The mechanical class of bug is a lint error and cannot silently return;
`pnpm test:e2e` covers 18 assertions on the entry flow. What is left is someone
listening to the back-office screens with a screen reader: Catalogue, Inventory,
Production, Collections, Materials, Suppliers, the settings tail.

*Verified by:* a written walk-through per screen, with findings fixed or
recorded as accepted.

### Phase 6 — The `--accent` decision (your call, not mine)

`DESIGN_SYSTEM.md` records `--accent` at lightness 0.483, inside the same band
as `success`, so **a primary button and a success state are one grey**. Fixing it
properly means having no brand hue at all — the primary surface becomes the
inverse of the background. That is a visual reset, not a token change.

This is a product and taste decision. I have no recommendation beyond noting the
defect is real and measured, and that it stays a defect until someone decides.

## Not in scope

Named so they are not mistaken for oversights:

- **PIN attribution is not per-person security** (`ARCHITECTURE.md` §4). Unchanged.
- **The balance calculation exists twice** — the Postgres view and
  `src/db/balances.ts`. Both tested. Sync may collapse this; nothing before it will.
- **Automated WhatsApp reminders** — manual-tap only, by design.
- **Rental inventory availability tracking** — not built, not planned here.
- **Component tests.** Zero `.test.tsx`, `vitest` runs in `environment: 'node'`,
  and screen behaviour is covered by `pnpm test:e2e` against a real browser.
  That tests something component tests structurally could not: the pointer-type
  shell split.
- **Self-service shop creation reconciliation** (D14) — a device creating a shop
  locally while its account has an admin-provisioned one. Returns with sync;
  belongs in that plan, not this one.

## Order, and why

1. **Phase 0** — hours, and one item prevents an installed app from opening.
2. **Phase 1** — closes data loss, no open questions.
3. **Phase 2** — cheaper now than after a year of backups carry the log.
4. **Decision 1** — the gate; nothing in Phase 3 can start without it.
5. **Phase 3** — the largest item in the project.
6. **Phase 4** — could run earlier and would be worth it; it is placed after
   Phase 3 only because sync wants two real devices anyway.
7. **Phases 5 and 6** — real, not urgent.

Phases 0 through 2 are roughly a week and remove the words "a lost phone is a
lost shop" from this document. That is the whole point of the ordering.
