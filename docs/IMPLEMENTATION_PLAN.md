# Implementation Plan

Companion to `ARCHITECTURE.md`. This is the build sequence -- what gets built in what order, and how each phase gets verified before moving on. Every step traces back to a decision in `ARCHITECTURE.md` section 6 or a screen/table in `pwa-schema-and-screens.md`.

Phases are sequential by design: each one produces something real and checkable before the next begins.

**Last revised:** 2026-07-30, after the Phase 0 review.


## Status at a glance

| Phase | State |
|---|---|
| Phase 0 -- infrastructure | Code complete, **not verified**. Every remaining item needs a real Supabase project and a real phone. |
| Phase 1 -- core v1 | Step 1 (shop login) done. Steps 2-11 not started. |
| Phase 2 -- catalogue | Not started. |

Nothing in Phase 0 that requires a browser, a phone, or a live Supabase project has been verified. That is not a small caveat: the two items with the most value -- sync actually working, and one shop genuinely being unable to read another's data -- are exactly the ones that cannot be checked from a keyboard alone. Treat Phase 0 as unfinished until the checklist below is signed off.


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
2. **Staff picker + PIN gate** -- reads `staff` for the current shop, PIN checked locally against `pin_hash`. Single-tap skip if only one active staff member.
   **Decide the hash before writing this.** The PIN is a 4-6 digit attribution check, not a password, but a plain SHA-256 of a 4-digit PIN is exhaustible in microseconds and the hash replicates to every device on the shop's account. Use WebCrypto PBKDF2 with a per-staff random salt and a deliberate iteration count. Do not invent a scheme; pick one and write down why.
3. **Settings: shop basics** -- name, WhatsApp number, and the measurement field editor (add/reorder/remove fields with label + unit). Built early because Clients and Measurements depend on this being configurable, not hardcoded.
4. **Clients** -- list, search, add. Client detail with the measurement profile form (rendered from whatever fields the shop configured in step 3) and order history.
5. **Orders** -- new/edit order form; order detail with the stage tracker, payments list, "add payment" flow, and the running balance.
   The balance comes from `observeBalance()` in `src/db/balances.ts`, **not** from the `order_balances` view. An earlier draft of this plan said otherwise; see decision D9.
   Every stage change writes an `order_stage_history` row in the same transaction as the order update, or the audit trail has gaps.
6. **WhatsApp button** -- `wa.me` link builder on the order detail screen, with stage-appropriate pre-filled text (ready for pickup, balance reminder), per `pwa-research-notes.md` section 7 Option A.
7. **Dashboard** -- due today / due this week / overdue balances / stage counts, all as reactive RxDB queries. The compound indexes those queries need are already in both schemas. Build this after orders and payments exist so there is real data to develop against.
8. **Reports (light)** -- weekly/monthly totals collected, outstanding balance total, stage counts.
9. **Settings: staff management** -- add/deactivate staff, set PINs.
10. **Settings: Export backup** -- downloads a JSON snapshot of the shop's data. Add a soft "last backup: N days ago" indicator on the dashboard or in settings, per `pwa-research-notes.md` section 6.
11. **Real icon set** -- replace the placeholder icons with final artwork at all required sizes.

### Before Phase 1 ships: RxDB migration strategies

Every collection is `version: 0` with no `migrationStrategies`. That is fine while the only installed data is test data. Once Phase 1 is on a real shop's phone, the first schema change without a migration strategy will fail to open the database on that phone, with the shop's orders inside it.

This is cheap now and expensive later, exactly like `order_stage_history` was. Do it before the first real install, not after.

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
- **Where balances are computed** -- client-side (D9). Newly decided.
- **Expired session while offline** -- app stays usable, sync stops, UI says so (D10). Newly decided.

## Decisions still open

- **PIN hashing algorithm** -- blocks Phase 1 step 2.
- **Offline double-booking** -- blocks Phase 2 step 5.
- **RxDB migration strategies** -- blocks the first real install.
