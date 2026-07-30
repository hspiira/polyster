# Cloth Tailoring & Rental Tracker -- Architecture

**Status:** Accepted
**Date:** 2026-07-30
**Last revised:** 2026-07-30 (Phase 1 steps 1-10; corrections in section 10)
**Deciders:** Ahum

This is the consolidated architecture reference and the current record of *what* the system is. It draws together decisions made across three earlier working documents -- `pwa-research-notes.md`, `pwa-schema-and-screens.md`, and `pwa-stack-options.md` -- which remain the record of *why*, with full source citations. Where any of those disagrees with this document, this document wins; the disagreements are listed in section 10.


## 1. System overview

This is one product, not two custom builds. Any number of independent cloth tailoring/rental shops ("tenants") use the same app and the same database, each seeing only their own data. A shop may be solo-run or have several staff sharing one or more devices; both cases use the identical architecture.

The core design constraint is that the app must keep working with no internet connection, because it's used shop-floor, day-to-day, in conditions where connectivity can't be assumed. Everything else -- the choice of local database, the sync mechanism, the choice not to depend on push notifications, and the decision to compute balances client-side rather than read a server view -- follows from that constraint.

```
                        ┌──────────────────────────────┐
                        │   Browser / installed PWA     │
                        │                               │
                        │  Preact UI  <-->  RxDB (local)│
                        │                     │         │
                        └─────────────────────┼─────────┘
                                              │  replication
                                              │  (online + authenticated only)
                                              ▼
                        ┌──────────────────────────────┐
                        │           Supabase            │
                        │  Postgres + Auth + Realtime   │
                        │  + Storage (catalogue photos) │
                        └──────────────────────────────┘

              Static assets (HTML/JS/CSS, service worker)
              served from:  Cloudflare Pages
```

The app always reads and writes to the local RxDB store first. Supabase is a sync partner, not the primary source of truth from the app's point of view -- this is the "local-first" pattern documented in `pwa-research-notes.md` section 8, and it's what makes offline use a first-class case rather than a fallback state.


## 2. Components

**Frontend (Preact + Vite).** A single-page app, no server-side rendering. Chosen specifically because this app has no SEO surface (it sits behind a login, nothing here is ever meant to be indexed) and no server-rendering need -- see decision D2 below. `vite-plugin-pwa` (Workbox-based) generates the manifest and service worker that make the app installable and cache the app shell.

**Local data layer (RxDB + Dexie.js storage).** Runs entirely in the browser on top of IndexedDB. Holds the working copy of every table the current shop can see. All UI reads and writes go through RxDB, never directly to Supabase -- this is what makes the UI stay responsive and functional offline.

**Backend (Supabase).** Postgres database (source of truth once synced), Auth (one account per shop, used for Row Level Security), Realtime (pushes changes to other devices on the same shop live), and Storage (catalogue item photos, Phase 2 only). No custom server is written or run for this app.

**Hosting (Cloudflare Pages).** Serves the built static assets. Chosen for unlimited free-tier bandwidth and CDN reach, both of which matter for a public, install-anywhere PWA with usage patterns that are hard to predict in advance.

**Sync layer (RxDB Supabase replication plugin).** Bidirectional: pulls remote changes via PostgREST and Supabase Realtime, pushes local changes the same way, and reconciles using a `_modified` timestamp per row. Runs whenever the device has connectivity *and* a live session; does nothing otherwise, and the app never waits on it.


## 3. Data flow

**Normal write (online):** Staff action → written to local RxDB → UI updates immediately from the local write → replication plugin pushes the change to Supabase in the background → Supabase Realtime notifies any other device currently open on that shop → their RxDB updates → their UI updates. The person who made the change never waits for this round trip; everyone else sees it arrive live.

**Write while offline:** Staff action → written to local RxDB → UI updates immediately, exactly as above. The change sits unsynced until connectivity returns, at which point the replication plugin pushes it automatically. Nothing in the UI needs to know or care whether the device is currently online -- but the UI does *show* it (see section 9).

**Conflict case:** two staff members edit the same order while both offline, then both reconnect. Rare in practice but not impossible. The Supabase replication plugin's conflict handling applies here -- still an untested assumption, and still a Phase 0 verification item.

**Read (dashboard, lists, balances):** always served from local RxDB via reactive queries. A screen never blocks on a network call to render.


## 4. Multi-tenancy and security model

Every table (except `shops` itself) carries a `shop_id`, directly or through a join. Row Level Security policies in Postgres restrict all reads and writes to rows matching the currently authenticated shop -- enforced at the database layer, not by the app remembering to filter correctly.

Four implementation rules make that guarantee real rather than nominal. All four are in `supabase/migrations/0001_init.sql`:

1. **Every policy names `to authenticated`.** A policy without it applies to `public`, which includes the `anon` role. It would still deny, because `auth.uid()` is null for anon, but that is an accident rather than a decision.
2. **The `order_balances` view is created `with (security_invoker = on)`.** A Postgres view runs with its *owner's* privileges by default, and the migration runs as a role that bypasses RLS. Without this, every shop could read every other shop's balances through the view even though the base tables are locked down correctly. This is the single easiest way to open a tenant-isolation hole in this design, which is why the Phase 0 checklist tests the view by name.
3. **`current_shop_id()` is `security definer` with a fixed `search_path`.** Definer rights keep the tenant lookup independent of the policies built on top of it; the fixed search path closes the privilege-escalation route Supabase's linter flags as `function_search_path_mutable`.
4. **`shops` permits select, update, and (as of D14) insert-of-your-own-row.** Originally select/update only, with shop rows provisioned out-of-band by an administrator -- self-provisioning was rejected outright. D14 reverses that: an owner can now create their own shop from the app, online or offline, tied to their own `auth.uid()` via `supabase/migrations/0004_shop_self_signup.sql`. Delete is still never permitted, and the insert policy's `with check` plus the existing `unique` constraint on `supabase_auth_user_id` together cap it at exactly one shop per account. Out-of-band provisioning by an administrator remains possible and is unaffected.

**Auth is shop-level; PIN is attribution-level, not a security boundary.** Each shop authenticates as one Supabase account. Staff PINs are an app-layer convenience on top -- they determine who gets credited with an action ("marked ready by [name]"), not who is allowed to do what. Anyone who can unlock the device and knows any staff member's PIN can act as that person. This was a deliberate simplification to avoid the overhead of real per-person accounts for a two-or-three-person shop. If a shop ever needs a genuine security boundary between staff members, that requires individual Supabase accounts per person, which is a bigger change than adding a new PIN.


## 5. Data model summary

Full field-level definitions live in `pwa-schema-and-screens.md`. Summary for orientation:

| Table | Purpose |
|---|---|
| `shops` | One row per tenant. Holds the Supabase auth account link and WhatsApp number. |
| `staff` | Staff members per shop, PIN hash, attribution only. |
| `clients` | Customers of a shop. |
| `measurement_fields` | Per-shop configurable list of measurement fields (chest/waist vs bust/hip, etc.) -- what makes one app fit shops with different garment types. |
| `measurement_profiles` | A client's saved measurements, as `jsonb` keyed by field. One per client, enforced by a unique constraint. |
| `orders` | The core work-tracking record: type (tailor-made/rental/purchase), stage, dates, price. Carries a nullable `catalogue_item_id` reserved for the Phase 2 catalogue module. |
| `payments` | Partial/multiple payments per order. Positive amounts only; a mistaken entry is voided by soft-delete, never by a negative correcting row. |
| `order_balances` | A Postgres view, not a table. **Server-side reporting only** -- see below. |
| `order_stage_history` | Logs every stage transition with who and when, for audit purposes. |
| `catalogue_items` (Phase 2) | Rental/sale stock, tracked as item-type + quantity, not individual physical pieces. |

### Balances are computed on the client

`order_balances` exists in Postgres and the app does not read it. RxDB replicates tables, not views, so a balance read from the view is a live network call on the order detail screen -- the screen most likely to be open with no connectivity. `src/db/balances.ts` derives the same figure from the already-replicated `payments` collection, applying the same two rules the view applies (soft-deleted payments excluded; no payments means zero, not null) and summing in integer minor units so floating-point error cannot make a fully-paid order show a balance of 0.0000000001.

Keeping two implementations of one calculation is a real cost. It is accepted because the alternative is a screen that stops working offline, and the calculation is small enough to unit-test exhaustively (`src/db/balances.test.ts`).

### `_modified` and `_deleted` are Postgres columns only

Every synced table carries `_modified` (timestamp) and `_deleted` (boolean, soft delete). These are a requirement of the RxDB-Supabase replication protocol.

**Neither is declared in the RxDB collection schemas.** RxDB rejects top-level fields beginning with `_` other than `_id` and `_deleted`, and it does so only when the dev-mode plugin is loaded -- which is development and tests, but not a production build. Getting this wrong therefore breaks `pnpm dev` while `vite build` passes clean. The first scaffold shipped exactly that bug. See `src/db/schema.ts` for the full reasoning and `src/db/database.test.ts` for the test that now prevents its return.

`_modified` is server-owned in any case: a BEFORE trigger sets it, and the replication plugin strips it from every pushed row.


## 6. Key decisions (summary)

Full trade-off writeups and sources are in `pwa-research-notes.md` and `pwa-stack-options.md`.

| # | Decision | Chosen | Rejected alternatives | Why |
|---|---|---|---|---|
| D1 | Local data layer + sync | RxDB + Supabase (Postgres) | Plain Dexie (no sync), Firebase Firestore, PouchDB/CouchDB | Needed real multi-device sync once multi-staff shops entered scope; Supabase avoids both a self-hosted server (CouchDB) and vendor lock to a proprietary format (Firestore). |
| D2 | Frontend framework | **Preact (settled 2026-07-30)** | Svelte, plain React, Next.js, vanilla JS | React-shaped API keeps ecosystem and maintainability high while staying small. Svelte was the leaner alternative; the bundle difference is smaller in practice than the isolated benchmark suggests once RxDB is in the build. Next.js rejected: no SSR/SEO need behind auth, and its server-oriented model fights an offline-first design. |
| D3 | Hosting | Cloudflare Pages | Vercel, Netlify | Unlimited free-tier bandwidth removes surprise-bill risk; strongest CDN reach helps first-load speed on weak connections. |
| D4 | Auth model | One Supabase account per shop + app-level staff PIN | Individual Supabase accounts per staff member | PIN is far lower friction for a 1-3 person shop opening the app dozens of times a day; explicitly not a hard security boundary (section 4). |
| D5 | Reminders | In-app "due today" dashboard | OS push notifications | Push reliability on iOS is conditional and fundamentally can't be guaranteed for an offline-first app anyway. |
| D6 | WhatsApp integration | `wa.me` pre-filled links (manual send) for v1; Cloud API automation on roadmap | Automated Cloud API sending in v1 | Zero infrastructure, zero cost, ships immediately. Automation needs a backend (token can't live client-side). |
| D7 | Data safety | Explicit in-app "Export backup" (JSON) | Relying on browser storage persistence alone | Browser-stored data isn't guaranteed permanent; cheap to build, meaningfully reduces data-loss risk. |
| D8 | Stock/catalogue model | Item-type + quantity, not individual physical pieces | Per-item unique tracking | Matches how shop stock actually works; scoped to rental/purchase orders only. |
| D9 | Balance calculation (new) | Computed client-side from replicated payments | Reading the `order_balances` Postgres view | The view is a network call on the most offline-critical screen. Section 5. |
| D10 | Expired session while offline | Keep the app fully usable, disable sync, say so in the UI | Force re-login | An app whose premise is "works with no internet" cannot lock the till because a JWT aged out overnight. Section 7. |
| D11 | Staff PIN hashing (new) | PBKDF2-HMAC-SHA256, per-staff 16-byte salt, 210,000 iterations, self-describing hash string | Plain digest; Argon2id | The PIN is not a security boundary, but the hash replicates to every device and people reuse four-digit numbers. A slow KDF costs the shop nothing (verified once per session) and turns an instant sweep of 10,000 candidates into one with a price. Argon2id means shipping WASM to a low-bandwidth device, which is not worth it here. See `src/lib/pin.ts`. |
| D12 | Routing (new) | `preact-iso`, real history URLs | Hash routing; hand-rolled router | The usual objection to history routing in a PWA is that deep links 404 on refresh. vite-plugin-pwa's generateSW mode defaults `navigateFallback` to `index.html`, so the service worker answers every navigation from the precached shell, offline included. Verified against the plugin's defaults. |
| D13 | Stage change and audit row (new) | Write the history row first, accept non-atomicity | A transaction | RxDB has no cross-collection transaction. Writing history first means a failure leaves a visible spurious entry; the other order silently drops the audit record, which is the only thing that table exists for. See `src/db/writes.ts`. |
| D14 | Shop creation (new) | Self-service, from the app, online or offline | Out-of-band provisioning only (original D4/section 4 rule 4) | An owner can now create their own shop locally at any time; `supabase_auth_user_id` is left unset until a live session exists, and the shop syncs once one does (`src/db/writes.ts`'s `createShop`, `supabase/migrations/0004_shop_self_signup.sql`). Reversed the original "no self-provisioning" reasoning deliberately: the alternative was a dead-end screen with no path forward for anyone without an already-provisioned account. Known gap: a device that creates a shop locally while offline, whose account also has (or later gets) an admin-provisioned shop row, will conflict once both try to sync -- not reconciled, accepted as a real edge case. Staff beyond the owner are gated on sync being available precisely to avoid a parallel version of this problem (`StaffSettings.tsx`). |


## 7. Session and startup sequence

Order matters, and it is enforced in `src/app.tsx`:

1. **Open the local database.** Nothing else can proceed without it, and it needs no network. A failure here is fatal and shown as such.
2. **Establish who the shop is.** `supabase-js` persists the session in localStorage, so a device that has signed in once opens straight into the app with no network.
3. **Start replication -- only now.** Starting it before authentication means RLS has nothing to scope the sync to, so it syncs zero rows and looks exactly like a broken connection.

Auth has four resting states (`src/lib/auth.ts`):

| State | Meaning | Local data | Sync |
|---|---|---|---|
| `signed_in` | Live session | Read/write | Running |
| `offline_stale` | Signed in before, no session reachable now | Read/write | Off, resumes automatically when the session is restored |
| `signed_out` | No session, no remembered login | Login screen | Off |
| `local_only` | No Supabase credentials in this build | Read/write | Off, permanently |

`offline_stale` is decision D10. Access tokens expire and refreshing one needs connectivity, so without this state the app would lock itself out overnight. It is not a security weakening: RLS is enforced server-side on every synced byte, an expired token syncs nothing at all, and the local copy is data the device already legitimately pulled. Writes queue in RxDB and push when the session comes back.


## 8. Deployment topology

There is no custom backend server anywhere in this system. The browser talks directly to Supabase's managed APIs (REST via PostgREST, WebSocket via Realtime) and to Cloudflare Pages for static assets.

```
Build:   pnpm build  ->  static assets (dist/)
Deploy:  push to main  ->  Cloudflare Pages auto-deploy
Runtime: browser <-> Cloudflare Pages (assets, cached by service worker)
         browser <-> Supabase (data, direct from client, governed by RLS)
```

**Bundle size is a design constraint, not a metric.** The users are on metered, low-bandwidth connections. RxDB's dev-mode and ajv-validation plugins are roughly 240 KB together and are loaded behind `import.meta.env.DEV` so Rollup can prove them unreachable and drop them. That guard has to be the statically-known constant, not a runtime flag -- passing a variable keeps both chunks in the build and in the service worker's precache manifest, where every install pays for them. See the comment in `src/db/database.ts`.


## 9. Making sync state visible

Unsynced work that nobody knows about is the worst failure this design can produce: a week of orders on one phone, and no signal that anything is wrong. So sync state is shown, not hidden, on every screen (`src/components/SyncBadge.tsx`) -- including when everything is fine, so that staff learn what "fine" looks like and notice when it changes.

A replication error is surfaced and never thrown. Sync failing is a normal condition for this app, not an exception.


## 10. Corrections folded in at build time

Recorded so the earlier documents can still be read without being misleading.

| # | Earlier document said | Actually |
|---|---|---|
| C1 | `pwa-stack-options.md` s3: every synced table needs `_modified`/`_deleted`, implying in the RxDB schema too | Postgres columns only. RxDB rejects `_modified`, and only in dev mode -- so it broke `pnpm dev` while the production build passed. Section 5. |
| C2 | `pwa-schema-and-screens.md` s2: `order_balances` "joined for convenience wherever a balance needs to be displayed" | Server-side reporting only. The UI computes balances locally. Section 5, D9. |
| C3 | Original migration comment: a view inherits the underlying tables' RLS automatically | It does not. It needs `security_invoker = on`, or every shop can read every other shop's balances. Section 4. |
| C4 | `pwa-stack-options.md` s1 and D2: Preact vs Svelte left open | Settled on Preact and built on. |
| C5 | Original `supabaseClient.ts`: "the app will still run offline-only without" the env vars | It threw on import. `createClient('')` raises `supabaseUrl is required.` The client is now built lazily. |


## 11. Known limitations (carried forward deliberately, not oversights)

- PIN-based staff attribution is not real per-person security (section 4).
- Self-service shop creation (D14) has no reconciliation if a device creates a shop locally while its account also has an admin-provisioned one -- not handled, accepted as a real edge case.
- Conflict resolution for simultaneous offline edits to the same record has a defined mechanism but **has not been tested end-to-end**. Phase 0 verification item.
- The balance calculation exists twice: the Postgres view and `src/db/balances.ts`. Unit-tested, but a change to one must be made to the other.
- No automated WhatsApp reminders in v1 -- manual-tap only, by design.
- No rental inventory availability tracking until Phase 2.
- No RxDB schema migration strategy yet. Every collection is `version: 0` with no `migrationStrategies`. This is fine only while there is no installed data; the first schema change after Phase 1 ships will fail to open the database without one. See IMPLEMENTATION_PLAN.md.
- The PIN iteration count (D11) was measured on a desktop and extrapolated to a phone. That extrapolation is not a measurement -- time it on the shop's actual handset.
- Backup exports but does not import. The UI says so plainly, but a backup with no restore path is a promise half-kept.
- The currency is hardcoded to UGX in `src/lib/money.ts`, in a product that is explicitly install-anywhere. One constant in one module, so the fix stays small.
- The Phase 1 screens have been driven in a desktop browser at phone dimensions, which is a simulation of a phone. Nothing has been used on real hardware.
- Screen-level behaviour has no automated coverage. The units are tested; the screens were verified by driving a browser once, which does not survive a refactor.


## Companion documents

- `pwa-research-notes.md` -- full research, sources, and reasoning behind each architectural choice
- `pwa-schema-and-screens.md` -- original field-level schema and screen-by-screen UI design, with build-time corrections marked
- `pwa-stack-options.md` -- concrete tool/library choices and why, with build-time corrections marked
- `IMPLEMENTATION_PLAN.md` -- phased build plan and verification checklist
