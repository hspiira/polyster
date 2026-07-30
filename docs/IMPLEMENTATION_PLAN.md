# Implementation Plan

Companion to `ARCHITECTURE.md`. This is the build sequence -- what gets built in what order, and how each phase gets verified before moving on. Nothing here should be a surprise; every step traces back to a decision in `ARCHITECTURE.md` section 6 or a screen/table in `pwa-schema-and-screens.md`.

Phases are sequential by design: each one produces something real and checkable before the next begins, rather than building everything at once and debugging it all together at the end.


## Phase 0 -- Project & infrastructure setup

Goal: an empty but fully wired-up app -- installable, offline-capable, syncing a dummy record end to end -- before any real screen is built. This phase exists to catch integration problems (service worker scope, RLS policies, replication config) while there's nothing else going on to confuse the diagnosis.

1. **Scaffold the project.** `npm create vite@latest` with the Preact + TypeScript template. Confirm it runs locally.
2. **Add Tailwind CSS.** Standard Vite + Tailwind setup.
3. **Add `vite-plugin-pwa`.** Configure manifest fields (name, short_name, 192px + 512px icons -- placeholders are fine for now, theme color, `display: "standalone"`, `start_url`). Register the service worker at the site root with explicit `scope: '/'` -- this is the specific MDN-documented gotcha flagged in `pwa-research-notes.md` section 1; get it right here rather than debugging a silent failure later.
4. **Add iOS-specific meta tags** (`apple-touch-icon`, `apple-mobile-web-app-title`) in `index.html`, since iOS Safari ignores the manifest for these -- also from research notes section 1.
5. **Create the Supabase project.** Note the project URL and anon key; store as environment variables, never committed.
6. **Write the first migration.** All tables from `pwa-schema-and-screens.md` section 2 (`shops`, `staff`, `clients`, `measurement_fields`, `measurement_profiles`, `orders`, `payments`) plus `order_stage_history` (included by default per `ARCHITECTURE.md` section 5) and the `order_balances` view. Every synced table gets `_modified` (timestamp, default now(), updated on write) and `_deleted` (boolean, default false) columns -- required by the RxDB-Supabase replication plugin, per `pwa-stack-options.md` section 3.
7. **Write Row Level Security policies.** Every table scoped to `shop_id = the authenticated user's shop` (via a lookup from `auth.uid()` to `shops.supabase_auth_user_id`). Test this explicitly with two dummy shop accounts before writing any UI -- confirm shop A truly cannot read shop B's rows, not just that the app doesn't happen to show them.
8. **Install RxDB** with the Dexie.js storage adapter (free tier, per the settled recommendation) and the Supabase replication plugin. Define RxDB collection schemas mirroring the Postgres tables.
9. **Wire up replication** for each collection and confirm bidirectional sync: write a dummy row locally, confirm it appears in Supabase; write a row directly in Supabase, confirm it appears locally.

**Phase 0 exit checklist:**
- [ ] App installs to home screen on an Android phone
- [ ] App installs to home screen on an iPhone (via Share -> Add to Home Screen) and shows the correct name/icon, not a generic screenshot thumbnail
- [ ] App loads and renders with the device in airplane mode
- [ ] A write made while offline appears in Supabase once connectivity returns, with no manual retry needed
- [ ] A change made directly in Supabase (simulating a second device) appears in the local app without a page reload
- [ ] Shop A's Supabase account genuinely cannot read Shop B's data (tested with real queries, not just UI absence)


## Phase 1 -- Core v1 (the usable app)

Goal: a shop owner can track a real order from measurement to pickup, take payments, and message a client, entirely within this app. This is the version that goes into real use.

Build order, roughly reflecting dependency order (later screens need earlier ones' data to exist):

1. **Shop-level login** -- Supabase Auth (email/password), one account per shop.
2. **Staff picker + PIN gate** -- reads `staff` for the current shop, PIN checked locally against `pin_hash`. Single-tap skip if only one active staff member.
3. **Settings: shop basics** -- name, WhatsApp number, and the measurement field editor (add/reorder/remove fields with label + unit). Built early because Clients/Measurements below depend on this being configurable, not hardcoded.
4. **Clients** -- list, search, add. Client detail with the measurement profile form (rendered from whatever fields the shop configured in step 3) and order history.
5. **Orders** -- new/edit order form; order detail with the stage tracker, payments list, "add payment" flow, and the running-balance display (read from `order_balances`).
6. **WhatsApp button** -- `wa.me` link builder on the order detail screen, with stage-appropriate pre-filled text (ready for pickup, balance reminder, etc.), per `pwa-research-notes.md` section 7 Option A.
7. **Dashboard** -- due today / due this week / overdue balances / stage counts, all as reactive RxDB queries. Build this after orders/payments exist so there's real data to query against while developing it.
8. **Reports (light)** -- weekly/monthly totals collected, outstanding balance total, stage counts.
9. **Settings: staff management** -- add/deactivate staff, set PINs.
10. **Settings: Export backup** -- downloads a JSON snapshot of the shop's data. Add a soft "last backup: N days ago" indicator somewhere visible (dashboard or settings), per `pwa-research-notes.md` section 6.
11. **Real icon set** -- replace placeholder icons from Phase 0 with final artwork at all required sizes.

**Phase 1 exit checklist:**
- [ ] A full order lifecycle (create client -> take measurements -> create order -> advance through stages -> take partial payments -> mark picked up) works entirely offline, then syncs correctly once reconnected
- [ ] Two staff members on two devices see each other's changes to the same shop's data live when both are online
- [ ] Export backup produces a JSON file that actually contains everything -- spot-check it against the live data
- [ ] Dashboard "due today" and "overdue balance" figures are verified correct against manually checked test data, not just visually plausible
- [ ] Tested on both an Android phone and an iPhone as installed, standalone apps -- not just in a desktop browser tab


## Phase 2 -- Catalogue module

Goal: rental/purchase stock tracking, scoped exactly as designed in `pwa-schema-and-screens.md` section 4. Starts only after Phase 1 is in real use, per the July 30 decision to ship core tracking first.

1. **Migration**: `catalogue_items` table (item-type + quantity model, per the confirmed stock model), RLS policy, `_modified`/`_deleted` columns.
2. **Supabase Storage bucket** for catalogue item photos.
3. **Catalogue screen** -- searchable/filterable grid.
4. **Catalogue item detail** -- photo, details, date-range availability check, "new rental/sale order" button.
5. **Order form update** -- add the "pick from catalogue" path alongside free-text entry, wired to the availability check so a double-booking can't be saved.
6. **Settings: catalogue management** -- add/edit items, upload photos, retire items.

**Phase 2 exit checklist:**
- [ ] Booking two overlapping rentals against the same item, past its available quantity, is actually blocked or clearly warned -- not just theoretically prevented by the schema
- [ ] A purchase order correctly reduces stock permanently, distinct from a rental reservation which only reduces availability for its date window


## Phase 3 -- Roadmap (not scheduled yet)

Recorded here so they aren't lost, not because they're next:

- **Automated WhatsApp reminders** (Option B, `pwa-research-notes.md` section 7) -- needs a small backend component (e.g. a Supabase Edge Function) to hold the Cloud API token safely, since it can't live in client-side code. Revisit once it's clear manual `wa.me` sending is an actual bottleneck.
- **Order stage history UI** -- the table is included from Phase 0, but no screen surfaces it yet; add a simple audit view if/when it's actually needed for a real dispute or question.
- **OS push notifications** -- for shops with reliably steady connectivity who'd prefer push over checking the in-app dashboard. Not a foundation to build on per the iOS reliability caveats in the research notes, but a reasonable opt-in add-on later.


## Deployment

1. Push the repository to a git host (GitHub/GitLab).
2. Connect the repo to Cloudflare Pages; configure the build command (`vite build`) and output directory (`dist`).
3. Set Supabase URL and anon key as environment variables in the Cloudflare Pages project settings -- never commit these to the repo.
4. Every push to the main branch auto-deploys. Confirm HTTPS is active (required for PWA installability, per `pwa-research-notes.md` section 1) -- Cloudflare Pages provides this by default.
5. Optional: attach a custom domain once one is decided on.


## Open items carried into this plan as working defaults

These were flagged as undecided earlier and given a default here so the plan isn't blocked, per `ARCHITECTURE.md` section 8. Both are cheap to revisit:

- **Preact vs Svelte** -- proceeding with Preact. Swapping later, before much UI is built, is not a large cost.
- **`order_stage_history`** -- included from the first migration by default, since adding it later is more expensive than removing it now if it turns out not to be wanted.
