# Implementation Plan

Companion to `ARCHITECTURE.md`. This is the build sequence -- what gets built in what order, and how each phase gets verified before moving on. Every step traces back to a decision in `ARCHITECTURE.md` section 6 or a screen/table in `pwa-schema-and-screens.md`.

Phases are sequential by design: each one produces something real and checkable before the next begins.

**Last revised:** 2026-07-30, after building Phase 1 steps 1-10.


## Status at a glance

| Phase | State |
|---|---|
| Phase 0 -- infrastructure | Code complete, **not verified**. Every remaining item needs a real Supabase project and a real phone. |
| Phase 1 -- core v1 | Steps 1-10 built and driven end to end in a browser. Step 11 (real icons) needs artwork. **Not tested on a phone, and not against Supabase.** |
| Phase 2 -- catalogue | Not started. |

Phase 1 has been driven in a desktop browser against seeded fixture data: sign-in, staff PIN gate, dashboard, clients, measurements, order detail, payments, reports, and settings all render and the arithmetic reconciles. That is worth something and it is not the same as working. Nothing has been opened on a phone, and nothing has been run against Supabase, which means every sync path in the app is still theory.

Nothing in Phase 0 that requires a browser, a phone, or a live Supabase project has been verified. That is not a small caveat: the two items with the most value -- sync actually working, and one shop genuinely being unable to read another's data -- are exactly the ones that cannot be checked from a keyboard alone. Treat Phase 0 as unfinished until the checklist below is signed off.


## Next tasks

The ordered list of what to pick up, with what "done" means for each. The phase sections below remain the full plan; this is the working queue.

The ordering is not arbitrary. N1 can invalidate work done after it, and N2-N4 are foundations that get more expensive to retrofit the further into the screens you are.

**Everything below N1 is now done except where noted.** N1 has not moved, because it cannot: it needs a Supabase project and a physical handset.

### Now -- unblocks everything else

**N1. Verify Phase 0 against a real project and real devices.**
Everything after this is built on assumptions until it is done. Create the Supabase project, run the migration, create **two** shop accounts with data in each, and work the Phase 0 exit checklist below.
*Do the tenant-isolation item first, not last.* If `select * from order_balances` as shop A returns shop B's rows, the schema is wrong and every screen built on top of it is built on a leak.
**Done when:** every box in the Phase 0 exit checklist is ticked, and the two that failed (there will usually be one or two) have fixes committed.
**Blocks:** N3 onwards. N2 can proceed in parallel.

### Done since this queue was written

**N2. PIN hashing.** PBKDF2-HMAC-SHA256 via WebCrypto, per-staff random salt,
210,000 iterations, in `src/lib/pin.ts`. Hashes are self-describing
(`pbkdf2$sha256$iterations$salt$hash`) so the cost can be raised later without
invalidating anyone's PIN. The iteration count was measured on a desktop
(~190ms) and extrapolated to a low-end phone; **that extrapolation is still not
a measurement.** Time it on the real hardware and adjust.

**N3. RxDB migration strategies.** Every collection declares one, empty at v0.
Two tests on a throwaway collection: one proves a document survives a version
bump, the other proves that bumping without a strategy fails to open -- which
is the scenario being kept off a shop's phone.

**N4. Router and app shell.** `preact-iso` with real history URLs. The usual
objection (deep links 404 on refresh) does not apply: vite-plugin-pwa's
generateSW mode defaults `navigateFallback` to `index.html`, so the service
worker answers every navigation offline. Bottom tab bar, four destinations,
persistent sync badge. **The Android back button is still unverified** -- it
needs a handset.

**N5. Dev fixtures.** Seeded from the dev panel rather than a `pnpm seed`
script, because the data has to go into the browser's IndexedDB and a Node
script cannot reach it. Refuses to run outside dev, and refuses when Supabase
is configured so it cannot push fixtures into a real project.

**N6-N11 and Phase 1 steps 8-10.** Staff gate, settings, clients, orders,
payments, WhatsApp, dashboard, reports, staff management, backup export. All
built and driven in a desktop browser.

**N12. CI.** `.github/workflows/verify.yml` runs `pnpm verify` on push and
pull request.

One correction to N9 as written above: it said every stage change writes its
history row "in the same transaction as the order update". RxDB has no
cross-collection transaction, so that is not possible. The history row is
written first instead, so a failure leaves a visible spurious entry rather
than silently losing the audit record. See the header of `src/db/writes.ts`.


## Next tasks, in order

**X1. Verify Phase 0 against a real project and real devices.** Unchanged from
N1 above, and still the thing everything else waits on.

**X2. Install on an actual phone and use it for a day.** Everything in Phase 1
was checked at 390x844 in a desktop browser, which is a simulation of a phone,
not a phone. What that cannot tell you: whether the tap targets work with
fabric in your other hand, whether the PIN pad is fast enough at 210,000
iterations on the shop's actual handset, whether the Android back button
behaves, and whether the date input is usable on iOS Safari.
**Done when:** someone has taken a real order on a real phone.

**X3. Decide whether backup needs a restore.** The export exists and the
screen says outright that there is no way to bring the file back in. That is
honest but it is not a backup strategy. Either build the import, or decide
that the real recovery path is Supabase and say so in the UI.

**X4. Measure and re-tune the PIN iteration count** on the lowest-end Android
the shop uses. Target roughly 250ms. See N2.

**X5. Currency.** Hardcoded to UGX in `src/lib/money.ts` for a product that is
explicitly install-anywhere. Fixing it properly means a `currency` column on
`shops`, a migration on both sides, and a settings field -- worth doing when a
shop outside Uganda is actually in view, not on speculation.

**X6. Real icons** (Phase 1 step 11). Needs artwork, not code.

**X7. A linter.** Still none. `strict` and the tests carry most of the weight,
so this stays low value, but it is cheap.

**X8. Component tests.** The units are covered (94 tests across dates, money,
balances, PIN, WhatsApp, stage flows, schema). The screens are not -- they were
verified by driving a browser once, which does not survive a refactor. The
order form's validation and the dashboard's bucketing are the two worth
pinning down first.


## Phase 0 -- Project & infrastructure setup

Goal: an empty but fully wired-up app -- installable, offline-capable, syncing end to end -- before any real screen is built. This phase exists to catch integration problems (service worker scope, RLS policies, replication config) while there's nothing else going on to confuse the diagnosis.

### Done

1. **Scaffold the project.** Vite + Preact + TypeScript. `strict` is on; it was off in the first scaffold, which is what let nullable Postgres columns be typed as guaranteed strings.
2. **Tailwind CSS.** Standard Vite + Tailwind v4 setup.
3. **`vite-plugin-pwa`.** Manifest configured (name, short_name, 192px + 512px + maskable icons, theme color, `display: standalone`, `start_url`), service worker registered at the site root with explicit `scope: '/'` -- the MDN-documented gotcha from `pwa-research-notes.md` section 1.
   `devOptions` is **off by default**. A live service worker in development caches aggressively and produces stale-asset confusion that reads as a code bug. Turn it on deliberately with `VITE_PWA_DEV=1 pnpm dev` when testing install or offline behaviour.
4. **iOS-specific meta tags** (`apple-touch-icon`, `apple-mobile-web-app-title`) in `index.html`, since iOS Safari ignores the manifest for these.
5. **The first migration** (`supabase/migrations/0001_init.sql`). All tables plus `order_stage_history` and the `order_balances` view. Value constraints (`amount > 0`, `price_total >= 0`, non-empty names, return date not before pickup date), a unique constraint enforcing one measurement profile per client, and compound indexes matching the dashboard's hot queries.
6. **Row Level Security policies.** Every table scoped to `shop_id = current_shop_id()`, with the four rules in `ARCHITECTURE.md` section 4: `to authenticated` on every policy, `security_invoker = on` on the view, `security definer` plus fixed `search_path` on the lookup function, and select/update-only on `shops`.
7. **RxDB with the Dexie storage adapter**, collection schemas mirroring the Postgres tables. `_modified`/`_deleted` are deliberately absent from those schemas -- see `ARCHITECTURE.md` section 5.
8. **Replication wired per collection**, started only after the shop login succeeds and cancelled on sign-out (`src/db/replication.ts`, `src/hooks/useReplication.ts`).
9. **Local balance calculation** (`src/db/balances.ts`), replacing UI reads of the `order_balances` view. Decision D9.
10. **A test harness that runs the real code path.** `pnpm test` creates every collection under `fake-indexeddb` with dev-mode forced on. This exists because the original scaffold's schema bug failed in `pnpm dev` and passed `vite build` -- a class of failure that must be caught by CI, not by a developer's laptop. Re-introducing that bug fails all six database tests.

### Remaining -- needs a real Supabase project and real devices

11. **Create the Supabase project** and run the migration. See README.md.
12. **Create two shop accounts**, not one. Tenant isolation cannot be tested with a single tenant.
13. **Work the exit checklist below.**

### Phase 0 exit checklist

Nothing here is checkable from a keyboard alone, which is why none of it is ticked.

- [ ] App installs to home screen on an Android phone
- [ ] App installs to home screen on an iPhone (via Share -> Add to Home Screen) and shows the correct name/icon, not a generic screenshot thumbnail
- [ ] App loads and renders with the device in airplane mode
- [ ] A device that signed in once opens straight into the app with no network, and shows "Working offline" rather than the login screen
- [ ] A write made while offline appears in Supabase once connectivity returns, with no manual retry needed
- [ ] A change made directly in Supabase (simulating a second device) appears in the local app without a page reload
- [ ] **Shop A's account cannot read Shop B's data.** Test with real queries against the tables *and* against `order_balances` specifically -- the view is the one object in this schema that can leak across tenants while every base table looks correctly locked down. `select * from order_balances` as shop A must return only shop A's rows.
- [ ] Two staff members editing the same order while both offline, then both reconnecting, resolves to something defensible. This is the conflict case in `ARCHITECTURE.md` section 3, still an assumption.

Sign off the isolation item last and deliberately. It is the one whose failure is silent.


## Phase 1 -- Core v1 (the usable app)

Goal: a shop owner can track a real order from measurement to pickup, take payments, and message a client, entirely within this app. This is the version that goes into real use.

Build order reflects dependency order (later screens need earlier ones' data to exist).

1. ~~**Shop-level login**~~ -- **done.** Supabase Auth (email/password), one account per shop, session persisted. Four auth states including `offline_stale`; see `ARCHITECTURE.md` section 7.
2. ~~**Staff picker + PIN gate**~~ -- **done.** Reads `staff` for the current shop, PIN checked locally against `pin_hash` with PBKDF2 (`src/lib/pin.ts`). A shop with one active staff member skips the gate entirely.
3. ~~**Settings: shop basics**~~ -- **done.** -- name, WhatsApp number, and the measurement field editor (add/reorder/remove fields with label + unit). Built early because Clients and Measurements depend on this being configurable, not hardcoded.
4. ~~**Clients**~~ -- **done.** list, search, add. Client detail with the measurement profile form (rendered from whatever fields the shop configured in step 3) and order history.
5. ~~**Orders**~~ -- **done.** new/edit order form; order detail with the stage tracker, payments list, "add payment" flow, and the running balance.
   The balance comes from `observeBalance()` in `src/db/balances.ts`, **not** from the `order_balances` view. An earlier draft of this plan said otherwise; see decision D9.
   Every stage change writes an `order_stage_history` row in the same transaction as the order update, or the audit trail has gaps.
6. ~~**WhatsApp button**~~ -- **done.** `wa.me` link builder on the order detail screen, with stage-appropriate pre-filled text (ready for pickup, balance reminder), per `pwa-research-notes.md` section 7 Option A.
7. ~~**Dashboard**~~ -- **done.** due today / due this week / overdue balances / stage counts, all as reactive RxDB queries. The compound indexes those queries need are already in both schemas. Build this after orders and payments exist so there is real data to develop against.
8. ~~**Reports (light)**~~ -- **done.** weekly/monthly totals collected, outstanding balance total, stage counts.
9. ~~**Settings: staff management**~~ -- **done.** add/deactivate staff, set PINs.
10. ~~**Settings: Export backup**~~ -- **done**, export only; no restore. See X3. downloads a JSON snapshot of the shop's data. Add a soft "last backup: N days ago" indicator on the dashboard or in settings, per `pwa-research-notes.md` section 6.
11. **Real icon set** (X6, needs artwork) -- replace the placeholder icons with final artwork at all required sizes.

### Before Phase 1 ships: RxDB migration strategies

**Done.** Every collection declares a `migrationStrategies` map, empty while all schemas sit at `version: 0`. The pattern is what matters: bumping a version without a strategy makes the database fail to open on a device that already holds data, and that device may be holding the only copy of a week's offline work. Two tests in `database.test.ts` cover both directions.

When you bump a `version` in `schema.ts`, add the strategy in the same commit.

### Phase 1 exit checklist

- [ ] A full order lifecycle (create client -> take measurements -> create order -> advance through stages -> take partial payments -> mark picked up) works entirely offline, then syncs correctly once reconnected
- [ ] Two staff members on two devices see each other's changes to the same shop's data live when both are online
- [ ] Export backup produces a JSON file that actually contains everything -- spot-check it against the live data
- [ ] Dashboard "due today" and "overdue balance" figures are verified correct against manually checked test data, not just visually plausible
- [ ] The balance shown in the app and the balance in `order_balances` agree for every test order. They are two implementations of one rule (`ARCHITECTURE.md` section 5) and this is the check that keeps them honest.
- [ ] Tested on both an Android phone and an iPhone as installed, standalone apps -- not just in a desktop browser tab


## Phase 2 -- Catalogue module

Goal: rental/purchase stock tracking, scoped exactly as designed in `pwa-schema-and-screens.md` section 4. Starts only after Phase 1 is in real use.

1. **Migration**: `catalogue_items` table (item-type + quantity model), RLS policy with the same four rules as Phase 0, `_modified`/`_deleted` columns.
2. **Supabase Storage bucket** for catalogue item photos, with its own access policy -- Storage does not inherit table RLS.
3. **Catalogue screen** -- searchable/filterable grid.
4. **Catalogue item detail** -- photo, details, date-range availability check, "new rental/sale order" button.
5. **Order form update** -- add the "pick from catalogue" path alongside free-text entry, wired to the availability check.
6. **Settings: catalogue management** -- add/edit items, upload photos, retire items.

**The availability check is the hard part, and it is an offline-first problem.** Two devices, both offline, can each book the last item in stock and both be locally valid. A client-side check cannot prevent that. Decide before building whether the answer is a Postgres constraint that rejects the second push, a warning the shop resolves manually, or accepting the double-booking as rare. This is the same class of problem as the conflict case in `ARCHITECTURE.md` section 3, and it deserves a decision rather than a hope.

### Phase 2 exit checklist

- [ ] Booking two overlapping rentals against the same item, past its available quantity, is actually blocked or clearly warned -- not just theoretically prevented by the schema
- [ ] The same double-booking attempted from two offline devices resolves the way the decision above says it should
- [ ] A purchase order correctly reduces stock permanently, distinct from a rental reservation which only reduces availability for its date window


## Phase 3 -- Roadmap (not scheduled)

Recorded so they aren't lost, not because they're next:

- **Automated WhatsApp reminders** (Option B, `pwa-research-notes.md` section 7) -- needs a small backend component (e.g. a Supabase Edge Function) to hold the Cloud API token, since it can't live in client-side code. Revisit once manual `wa.me` sending is a demonstrated bottleneck.
- **Order stage history UI** -- the table is populated from Phase 1; no screen surfaces it yet. Add a simple audit view if a real dispute calls for one.
- **OS push notifications** -- opt-in add-on for shops with steady connectivity. Not a foundation to build on, per the iOS reliability caveats in the research notes.
- **A linter and CI.** `pnpm verify` (typecheck, tests, build) runs the checks; nothing runs it automatically on push. Worth wiring up once more than one person touches this.


## Deployment

1. Push the repository to a git host (GitHub/GitLab).
2. Connect the repo to Cloudflare Pages. Build command `pnpm build`, output directory `dist`.
3. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as environment variables in the Cloudflare Pages project settings. Never commit them.
   These are build-time variables baked into the bundle, not runtime secrets. The anon key is designed to be public and is safe there -- RLS is what protects the data, which is why the policies in the migration are load-bearing rather than defence in depth.
4. Every push to main auto-deploys. Confirm HTTPS is active (required for PWA installability) -- Cloudflare Pages provides it by default.
5. Optional: attach a custom domain.


## Decisions closed since the first draft

- **Preact vs Svelte** -- settled on Preact and built on (`ARCHITECTURE.md` D2).
- **`order_stage_history`** -- included from the first migration, as planned.
- **Where balances are computed** -- client-side (D9).
- **Expired session while offline** -- app stays usable, sync stops, UI says so (D10).
- **PIN hashing** -- PBKDF2-HMAC-SHA256, per-staff salt, 210,000 iterations, self-describing hash format (D11).
- **Routing** -- `preact-iso` with history URLs, relying on the service worker's `navigateFallback` (D12).
- **Stage/history atomicity** -- not achievable in RxDB; history is written first so a failure is visible rather than silent (D13).

## Decisions still open

| Decision | Blocks | Task |
|---|---|---|
| Offline double-booking | Phase 2 step 5 | Phase 2 |
| Whether backup needs a restore path | Nothing yet, but it is a promise the UI is not making good on | X3 |
| Currency, hardcoded to UGX | Any shop outside Uganda | X5 |

Closed since: PIN hashing (PBKDF2, N2), router and shell (`preact-iso`, N4), RxDB migration strategies (N3).

None of these should be resolved by whoever happens to reach them mid-screen. Each one is written down here because defaulting quietly is how they turn into things nobody remembers choosing.
