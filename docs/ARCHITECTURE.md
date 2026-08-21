# Cloth Tailoring & Rental Tracker -- Architecture

**Status:** Accepted
**Date:** 2026-07-30
**Last revised:** 2026-07-30 (Phase 1 steps 1-10; corrections in section 10)
**Deciders:** Ahum

This is the architecture reference and the record of both *what* the system is
and *why*. It absorbed three pre-build working documents (research notes, stack
options, schema and screens) when the last of their open questions closed; where
they had been contradicted by the build, the contradictions are kept in section
10 rather than quietly dropped.


## 1. System overview

This is one product, not two custom builds. Any number of independent cloth tailoring/rental shops ("tenants") use the same app and the same database, each seeing only their own data. A shop may be solo-run or have several staff sharing one or more devices; both cases use the identical architecture.

The core design constraint is that the app must keep working with no internet connection, because it's used shop-floor, day-to-day, in conditions where connectivity can't be assumed. Everything else -- the choice of local database, the sync mechanism, the choice not to depend on push notifications, and the decision to compute balances client-side rather than read a server view -- follows from that constraint.

```
                        ┌───────────────────────────────┐
                        │   Browser / installed PWA      │
                        │                                │
                        │  Preact UI  <-->  Dexie        │
                        │                   (IndexedDB)  │
                        └────────────────────┼───────────┘
                                             │  image upload and the
                                             │  public passport only
                                             ▼
                        ┌───────────────────────────────┐
                        │           Supabase            │
                        │  Postgres + Auth + Storage    │
                        └───────────────────────────────┘

              Static assets (HTML/JS/CSS, service worker)
              served from:  Cloudflare Pages
```

Every screen reads and writes the device. There is no code path where rendering
a screen waits on the network.


## 1a. One data path

The app was two paths until the Dexie switch: an offline core, and eleven
back-office areas that queried Supabase directly and were blank without a
connection. Both are now one. Every table lives on the device, and
`src/db/dexie/stores.ts` is the authoritative list.

What still needs the network, and why each earns it:

- **Image upload** (`src/online/images.ts`). A product or collection photo is a
  URL the shop shares; holding megabytes of it on a phone buys nothing.
- **The garment passport** (`src/online/garmentPassport.ts`). Read by anonymous
  visitors, so it is a server function -- that function is the whole security
  boundary, and it cannot live on the device that is being read *about*.

Neither is on the shop-floor path. A tailor with no signal can take an order,
record a payment, move stock and close a batch.


## 2. Components

**Frontend (Preact + Vite).** A single-page app, no server-side rendering. Chosen specifically because this app has no SEO surface (it sits behind a login, nothing here is ever meant to be indexed) and no server-rendering need -- see decision D2 below. `vite-plugin-pwa` (Workbox-based) generates the manifest and service worker that make the app installable and cache the app shell.

**Local data layer (Dexie on IndexedDB).** Runs entirely in the browser. Holds every table the current shop can see. Screens go through `src/db/repo/`, never `src/db/dexie/` and never Supabase; the repository layer is the only thing that knows a row can be soft-deleted, and the only thing that writes the audit log.

**Backend (Supabase).** Auth (one account per shop), Storage (catalogue and collection photos), and one Postgres function behind the public garment passport. The schema and its Row Level Security policies are still maintained -- see section 11 for what that leaves unresolved. No custom server is written or run for this app.

**Hosting (Cloudflare Pages).** Serves the built static assets. Chosen for unlimited free-tier bandwidth and CDN reach, both of which matter for a public, install-anywhere PWA with usage patterns that are hard to predict in advance.

**Sync layer.** None. Replication was dropped with RxDB and has not been rebuilt; `src/lib/syncState.ts` reports `idle` so the badge tells the truth rather than implying a sync that cannot happen. A backup file (D7) is the only way data leaves a device. Section 11 states what that costs.


## 3. Data flow

**Write:** Staff action → a repository function writes the row and its audit
event in one Dexie transaction → every live query touching those tables
re-emits → the UI updates. Connectivity does not enter into it, so there is no
second path to get wrong.

**Read:** always a `liveQuery` over the local stores, built in `src/db/repo/`
and subscribed with `useQuery`. A screen never blocks on a network call to
render.

**Conflict case:** does not arise while there is one device and no
replication. It returns the day sync does, and section 11 records that it is
unresolved rather than solved.


## 4. Multi-tenancy and security model

Every table (except `shops` itself) carries a `shop_id`, directly or through a join. Row Level Security policies in Postgres restrict all reads and writes to rows matching the currently authenticated shop -- enforced at the database layer, not by the app remembering to filter correctly.

Four implementation rules make that guarantee real rather than nominal. All four are in `supabase/migrations/0001_init.sql`:

1. **Every policy names `to authenticated`.** A policy without it applies to `public`, which includes the `anon` role. It would still deny, because `auth.uid()` is null for anon, but that is an accident rather than a decision.
2. **The `order_balances` view is created `with (security_invoker = on)`.** A Postgres view runs with its *owner's* privileges by default, and the migration runs as a role that bypasses RLS. Without this, every shop could read every other shop's balances through the view even though the base tables are locked down correctly. This is the single easiest way to open a tenant-isolation hole in this design, which is why the Phase 0 checklist tests the view by name.
3. **`current_shop_id()` is `security definer` with a fixed `search_path`.** Definer rights keep the tenant lookup independent of the policies built on top of it; the fixed search path closes the privilege-escalation route Supabase's linter flags as `function_search_path_mutable`.
4. **`shops` permits select, update, and (as of D14) insert-of-your-own-row.** Originally select/update only, with shop rows provisioned out-of-band by an administrator -- self-provisioning was rejected outright. D14 reverses that: an owner can now create their own shop from the app, online or offline, tied to their own `auth.uid()` via `supabase/migrations/0004_shop_self_signup.sql`. Delete is still never permitted, and the insert policy's `with check` plus the existing `unique` constraint on `supabase_auth_user_id` together cap it at exactly one shop per account. Out-of-band provisioning by an administrator remains possible and is unaffected.

**The credential is an email and a password**, optionally a social provider (`VITE_OAUTH_PROVIDERS`). This replaces decision E1's phone-plus-one-time-code, which is withdrawn: Supabase cannot enable phone auth at all without a third-party SMS provider, and Twilio's Uganda rate is $0.3289 per message behind a ~3 week sender-ID pre-registration, with no numeric sender IDs supported on MTN, Airtel, Africell or Smart. Email and password need no provider, no registration and no per-message cost. The phone number stays as `shops.whatsapp_number`, which is what it was for.

If an SMS or WhatsApp provider is bought later, OTP returns as one more method on `AuthDeps` in `src/lib/auth.ts` — WhatsApp authentication templates price around $0.0084 a message via Twilio, roughly forty times cheaper than SMS, and are the channel this market actually uses. The dead OTP implementation is deliberately not kept in the meantime.

**Known gap.** Nothing stops an account that already owns a shop from claiming a second, unclaimed local shop. `claimShop` only checks the local document; the `unique` constraint on `shops.supabase_auth_user_id` then rejects the push, so the device holds data that will never sync. This predates the auth change and is not fixed by it — closing it needs a server-side check at claim time.

**Auth is shop-level; PIN is attribution-level, not a security boundary.** Each shop authenticates as one Supabase account. Staff PINs are an app-layer convenience on top -- they determine who gets credited with an action ("marked ready by [name]"), not who is allowed to do what. Anyone who can unlock the device and knows any staff member's PIN can act as that person. This was a deliberate simplification to avoid the overhead of real per-person accounts for a two-or-three-person shop. If a shop ever needs a genuine security boundary between staff members, that requires individual Supabase accounts per person, which is a bigger change than adding a new PIN.


## 5. Data model summary

Field-level definitions are the row types in `src/db/schema/` and the DDL in `supabase/migrations/`. Summary for orientation:

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

`order_balances` exists in Postgres and the app does not read it. A balance read from a view is a live network call on the order detail screen -- the screen most likely to be open with no connectivity. `src/db/balances.ts` derives the same figure from the local `payments` store, applying the same two rules the view applies (soft-deleted payments excluded; no payments means zero, not null) and summing in integer minor units so floating-point error cannot make a fully-paid order show a balance of 0.0000000001. The live versions are in `src/db/repo/balances.ts`.

Keeping two implementations of one calculation is a real cost. It is accepted because the alternative is a screen that stops working offline, and the calculation is small enough to unit-test exhaustively (`src/db/balances.test.ts`).

### `_modified` and `_deleted` are Postgres columns only

Postgres keeps `_modified` and `_deleted` for whenever sync is rebuilt. On the device neither exists: a removed row carries `deleted_at`, an ordinary nullable column with no special meaning to the storage engine, and `src/db/repo/base.ts` is the only place that reads it. Every query goes through that layer, so no screen has to remember to filter.

The importer that brings a shop off the old RxDB databases is the one thing that still knows the old shape -- including that RxDB stored `_deleted` as the string `"1"`, not a boolean. `src/db/dexie/importRow.ts` has the property tests for it.

`_modified` is server-owned in any case: a BEFORE trigger sets it, and the replication plugin strips it from every pushed row.


## 6. Key decisions (summary)



| # | Decision | Chosen | Rejected alternatives | Why |
|---|---|---|---|---|
| D1 | Local data layer | **Dexie on IndexedDB (settled 2026-08-21)** | RxDB (what this replaced), Firebase Firestore, PouchDB/CouchDB | RxDB's free tier caps a database at 13 collections, counted across every open instance. The app sat exactly at the cap, which is why eleven feature areas were pushed online-only in an app whose whole point is working offline. IndexedDB has no such limit and gives atomic multi-store transactions, which RxDB never had. The cost is that replication went with it -- see the sync layer in section 2. |
| D2 | Frontend framework | **Preact (settled 2026-07-30)** | Svelte, plain React, Next.js, vanilla JS | React-shaped API keeps ecosystem and maintainability high while staying small. Next.js rejected: no SSR/SEO need behind auth, and its server-oriented model fights an offline-first design. |
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
| D13 | Stage change and audit row | One Dexie transaction | Write the history row first and accept non-atomicity | Superseded by D1: RxDB had no cross-collection transaction, so the old rule was to write history first and accept a possible spurious entry. Dexie has one, so a row and its audit event now land together or not at all. See `src/db/repo/base.ts`. |
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

`offline_stale` is decision D10. Access tokens expire and refreshing one needs connectivity, so without this state the app would lock itself out overnight. It is not a security weakening: an expired token reaches nothing, and the local copy is data the device already legitimately holds. Nothing is waiting to be pushed, because nothing pushes.


## 8. Deployment topology

There is no custom backend server anywhere in this system. The browser talks directly to Supabase's managed APIs (REST via PostgREST, WebSocket via Realtime) and to Cloudflare Pages for static assets.

```
Build:   pnpm build  ->  static assets (dist/)
Deploy:  push to main  ->  Cloudflare Pages auto-deploy
Runtime: browser <-> Cloudflare Pages (assets, cached by service worker)
         browser <-> Supabase (data, direct from client, governed by RLS)
```

**Bundle size is a design constraint, not a metric.** The users are on metered, low-bandwidth connections. Dropping RxDB took its runtime, its dev-mode plugin and its ajv validator out of the build; Dexie is a fraction of the size and needs no schema validator, because the row types are checked at compile time instead.

### Installability, and the three things that quietly break it

Carried over from the pre-build research because each is a real bug that has
been shipped by someone, not a hypothetical.

- **Service worker scope.** A worker registered at `/js/sw.js` controls only
  pages under `/js/`. It has to be served from the root, or install succeeds and
  intercepts nothing. `vite-plugin-pwa` emits `dist/sw.js` for this reason.
- **Manifest minimum** (per MDN): `name` or `short_name`, a 192px *and* a 512px
  icon, `start_url`, a display mode, over HTTPS or localhost. Chromium browsers
  drive the install prompt straight off it.
- **iOS Safari ignores most of the manifest** for name and icon. Without
  `apple-touch-icon` and `apple-mobile-web-app-title` it installs as a generic
  screenshot thumbnail labelled with the bare domain, and since iOS 16.4 install
  is Share → Add to Home Screen with no prompt at all. Both platforms are
  expected among shop owners, so both need testing on hardware -- see section 11,
  where that is still outstanding.


## 9. Making sync state visible

Unsynced work that nobody knows about is the worst failure this design can produce: a week of orders on one phone, and no signal that anything is wrong. So sync state is shown, not hidden, on every screen (`src/components/SyncBadge.tsx`) -- including when everything is fine, so that staff learn what "fine" looks like and notice when it changes.

There is nothing to sync at present, so the badge reads "Only on this phone" for an unclaimed shop and "Not syncing" otherwise. That is deliberately blunt: a badge that implied a backup existed would be worse than no badge.


## 9a. The visual system: fills, not lines

The shell's surfaces are separated from the page by their fill and nothing else. No borders, no shadows, and a radius (`--radius-card`, 2px) small enough to read as a cut edge rather than a rounded tile. Page is stone-100/950, raised surfaces are white/stone-900, recessed controls are stone-200/800. Tokens and the full list of consequences are in the header of `src/index.css`.

Four things follow from it that are easy to mistake for bugs:

- **Row lists have no dividers.** Padding separates rows. `Clients` keeps its avatar column because on a list of similar-looking text rows, padding alone is not enough.
- **Inputs have no resting border.** They are a recessed fill. The focus ring stays, because it is the only indicator a keyboard user has.
- **Sticky headers are page-coloured.** The Shell's status strip and each `Screen`'s header are both the page colour with no border, so they read as one quiet block and surfaces scroll away behind the page rather than behind a floating bar.
- **The entry flow is exempt.** It is a fixed dark glass world (spec E6) and keeps `--radius-control`'s full pill plus its own `rounded-xl` on notes. Changing `--radius-control` would square off the landing screen and the PIN pad.

Muted text is stone-500, not stone-400. stone-400 on the stone-100 page is roughly 2.3:1, which fails AA, and this app is documented as used outdoors in direct sun. Quiet stops short of unreadable.


## 9b. PIN hashing parameters

Moved here from `src/lib/pin.ts`, which now carries a two-line header per the
comment rule in `docs/DESIGN_SYSTEM.md`.

**What the hash protects.** The PIN is attribution, not a security boundary
(D4): anyone holding the unlocked device can act as any staff member whose PIN
they know, and that is accepted. The hash protects something narrower and real —
`staff.pin_hash` replicates to every device and sits in a Postgres row, so
anyone reaching that row must not walk away with the PINs themselves, because
people reuse the same digits on phone locks and mobile money.

**Why a slow KDF for six digits.** A six-digit PIN is a million candidates,
exhausted against plain SHA-256 in well under a second. A slow KDF does not
enlarge the keyspace but gives the break a cost, and costs the shop nothing: the
PIN is verified once when a staff member picks their name, not per action.
PBKDF2-HMAC-SHA256 via WebCrypto, because it is the only password KDF the
platform offers natively — Argon2id or scrypt would be better and both mean
shipping WASM to a low-bandwidth device.

**Iteration count: 210,000.** OWASP's guidance for PBKDF2-HMAC-SHA256 is, to the
best of my knowledge, 600,000 iterations — **this figure has not been verified
against OWASP's cheat sheet and should be treated as the number to check, not a
citation.** That guidance is calibrated for server-side verification on server
hardware. Measured on the development machine (Node 22, x64 desktop): 210,000
takes approximately 190ms, 600,000 approximately 490ms. A low-end Android is
commonly several times slower, which puts 210,000 somewhere around half a second
to a second and a half on target hardware.

**That extrapolation is not a measurement.** Time it on the lowest-end Android
the shop actually uses, target roughly 250ms there, and raise the count if there
is headroom. Raising it later does not invalidate existing PINs: the count lives
inside every hash string, `verifyPin` reads parameters from the stored hash, and
`needsRehash` reports which records are behind.

**Format.** `pbkdf2$sha256$<iterations>$<salt-b64>$<hash-b64>` — self-describing,
so a future change is a migration of records rather than a flag day.


## 10. Corrections folded in at build time

Recorded so the earlier documents can still be read without being misleading.

| # | Earlier document said | Actually |
|---|---|---|
| C1 | Stack options s3: every synced table needs `_modified`/`_deleted`, implying in the local schema too | Postgres columns only. On the device a removed row carries `deleted_at`. Section 5. |
| C2 | Schema and screens s2: `order_balances` "joined for convenience wherever a balance needs to be displayed" | Server-side reporting only. The UI computes balances locally. Section 5, D9. |
| C3 | Original migration comment: a view inherits the underlying tables' RLS automatically | It does not. It needs `security_invoker = on`, or every shop can read every other shop's balances. Section 4. |
| C4 | Stack options s1 and D2: Preact vs Svelte left open | Settled on Preact and built on. |
| C5 | Original `supabaseClient.ts`: "the app will still run offline-only without" the env vars | It threw on import. `createClient('')` raises `supabaseUrl is required.` The client is now built lazily. |


## 11. Known limitations

Moved to `STATUS.md`, so that open items live in one place rather than three.
The architectural ones worth knowing before reading further: there is no sync,
the balance rule exists both in Postgres and in `src/db/balances.ts`, and the
Dexie schema has no upgrade path written yet.


## Companion documents

- `STATUS.md` -- where the project is, what evidences it, and what is open. The entry point for "what is next"
- `POLYSTER.md` -- the product spec: every feature phase, and the rules a new module has to meet
- `DESIGN_SYSTEM.md` -- colour, type and the rules `pnpm check:design` enforces. Read before touching any UI
- `superpowers/` -- the dated design record: plans, specs and reviews, kept as history rather than maintained
