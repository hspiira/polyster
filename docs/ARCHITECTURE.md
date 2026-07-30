# Cloth Tailoring & Rental Tracker -- Architecture

**Status:** Accepted
**Date:** 2026-07-30
**Deciders:** Ahum

This is the consolidated architecture reference. It draws together decisions made across three earlier working documents -- `pwa-research-notes.md`, `pwa-schema-and-screens.md`, and `pwa-stack-options.md` -- into one document a developer (including a future version of this project) can read first. Those three documents remain the record of *why*, with full source citations; this one is the record of *what*, kept current as the system gets built.

One correction folded in from the most recent discussion: the framework choice between Preact and Svelte was left open pending your input. To keep this document usable as a build reference, it proceeds with **Preact** as the working decision (smaller ecosystem risk, React-shaped API), consistent with the lean stated in `pwa-stack-options.md`. This is called out again in the decisions table below and is a cheap swap if you'd rather go with Svelte -- nothing else in this document depends on which one is picked.


## 1. System overview

This is one product, not two custom builds. Any number of independent cloth tailoring/rental shops ("tenants") use the same app and the same database, each seeing only their own data. A shop may be solo-run or have several staff sharing one or more devices; both cases use the identical architecture.

The core design constraint is that the app must keep working with no internet connection, because it's used shop-floor, day-to-day, in conditions where connectivity can't be assumed. Everything else -- the choice of local database, the sync mechanism, even the choice not to depend on push notifications -- follows from that constraint.

```
                        ┌─────────────────────────────┐
                        │   Browser / installed PWA    │
                        │                               │
                        │  Preact UI  <-->  RxDB (local)│
                        │                     │          │
                        └─────────────────────┼──────────┘
                                              │  replication
                                              │  (online only)
                                              ▼
                        ┌─────────────────────────────┐
                        │           Supabase            │
                        │  Postgres + Auth + Realtime   │
                        │  + Storage (catalogue photos) │
                        └─────────────────────────────┘

              Static assets (HTML/JS/CSS, service worker)
              served from:  Cloudflare Pages
```

The app always reads and writes to the local RxDB store first. Supabase is a sync partner, not the primary source of truth from the app's point of view -- this is the "local-first" pattern documented in `pwa-research-notes.md` section 8, and it's what makes offline use a first-class case rather than a fallback state.


## 2. Components

**Frontend (Preact + Vite).** A single-page app, no server-side rendering. Chosen specifically because this app has no SEO surface (it sits behind a login, nothing here is ever meant to be indexed) and no server-rendering need -- see the Next.js discussion folded into decision D2 below. `vite-plugin-pwa` (Workbox-based) generates the manifest and service worker that make the app installable and cache the app shell.

**Local data layer (RxDB + Dexie.js storage).** Runs entirely in the browser on top of IndexedDB. Holds the working copy of every table the current shop can see. All UI reads and writes go through RxDB, never directly to Supabase -- this is what makes the UI stay responsive and functional offline.

**Backend (Supabase).** Postgres database (source of truth once synced), Auth (one account per shop, used for Row Level Security), Realtime (pushes changes to other devices on the same shop live), and Storage (catalogue item photos, phase 2 only). No custom server is written or run for this app -- Supabase's managed services cover everything the backend needs to do.

**Hosting (Cloudflare Pages).** Serves the built static assets. Chosen for unlimited free-tier bandwidth and CDN reach, both of which matter for a public, install-anywhere PWA with usage patterns that are hard to predict in advance.

**Sync layer (RxDB Supabase replication plugin).** Bidirectional: pulls remote changes via PostgREST and Supabase Realtime, pushes local changes the same way, and reconciles using a `_modified` timestamp per row. Runs automatically whenever the device has connectivity; does nothing when offline, and the app doesn't wait on it for anything.


## 3. Data flow

**Normal write (online):** Staff action → written to local RxDB → UI updates immediately from the local write → replication plugin pushes the change to Supabase in the background → Supabase Realtime notifies any other device currently open on that shop → their RxDB updates → their UI updates. The person who made the change never waits for this round trip; everyone else sees it arrive live.

**Write while offline:** Staff action → written to local RxDB → UI updates immediately, exactly as above. The change simply sits unsynced until connectivity returns, at which point the replication plugin pushes it automatically. Nothing in the UI needs to know or care whether the device is currently online.

**Conflict case:** two staff members edit the same order while both offline, then both reconnect. This is rare in practice (two people editing the exact same order at the exact same moment) but not impossible. The Supabase replication plugin's conflict handling applies here -- worth a deliberate test during Phase 0 (see `IMPLEMENTATION_PLAN.md`) rather than an assumption it "just works."

**Read (dashboard, lists, etc.):** always served from local RxDB via reactive queries. A screen never blocks on a network call to render -- the data it shows may be a few seconds stale if offline, but it is always immediately available.


## 4. Multi-tenancy and security model

Every table (except `shops` itself) carries a `shop_id`. Row Level Security policies in Postgres restrict all reads and writes to rows matching the currently authenticated shop -- enforced at the database layer, not by the app remembering to filter correctly. This is what guarantees one shop's data is never visible to another, even though they share one database and one deployed app.

**Auth is shop-level; PIN is attribution-level, not a security boundary.** Each shop authenticates as one Supabase account. Staff PINs are an app-layer convenience on top -- they determine who gets credited with an action (e.g. "marked ready by [name]"), not who is allowed to do what. Anyone who can unlock the device and knows any staff member's PIN can act as that person. This was a deliberate simplification to avoid the overhead of real per-person accounts for a two-or-three-person shop, made explicit here so it stays a conscious trade-off rather than a gap discovered later. If a shop ever needs a genuine security boundary between staff members, that requires individual Supabase accounts per person, which is a bigger change than adding a new PIN.


## 5. Data model summary

Full field-level definitions live in `pwa-schema-and-screens.md`. Summary for orientation:

| Table | Purpose |
|---|---|
| `shops` | One row per tenant. Holds the Supabase auth account link and WhatsApp number. |
| `staff` | Staff members per shop, PIN hash, attribution only. |
| `clients` | Customers of a shop. |
| `measurement_fields` | Per-shop configurable list of measurement fields (chest/waist vs bust/hip, etc.) -- what makes one app fit shops with different garment types. |
| `measurement_profiles` | A client's saved measurements, as `jsonb` keyed by field. |
| `orders` | The core work-tracking record: type (tailor-made/rental/purchase), stage, dates, price. Carries a nullable `catalogue_item_id` reserved for the phase 2 catalogue module. |
| `payments` | Partial/multiple payments per order; balance is always derived, never stored. |
| `order_balances` | A Postgres view, not a table -- `price_total` minus summed payments. |
| `order_stage_history` (default: included) | Logs every stage transition with who and when, for audit purposes. Cheap to add at schema-design time; treated as in-scope by default rather than deferred, since retrofitting it later is the more expensive path. Trivial to drop before the first migration if it turns out not to be wanted. |
| `catalogue_items` (phase 2) | Rental/sale stock, tracked as item-type + quantity (not individual physical pieces), per the July 30 decision in `pwa-schema-and-screens.md` section 4. |

Every synced table additionally needs `_modified` (timestamp) and `_deleted` (boolean, soft delete) columns -- a requirement of the RxDB-Supabase replication protocol, documented in `pwa-stack-options.md` section 3. This is a real schema detail, not optional plumbing, and needs to be in the first migration.


## 6. Key decisions (summary)

Full trade-off writeups and sources are in `pwa-research-notes.md` and `pwa-stack-options.md`. This table is the fast-reference version.

| # | Decision | Chosen | Rejected alternatives | Why |
|---|---|---|---|---|
| D1 | Local data layer + sync | RxDB + Supabase (Postgres) | Plain Dexie (no sync), Firebase Firestore, PouchDB/CouchDB | Needed real multi-device sync once multi-staff shops entered scope; Supabase avoids both a self-hosted server (CouchDB) and vendor lock to a proprietary format (Firestore). |
| D2 | Frontend framework | Preact (working decision, reversible) | Svelte, plain React, Next.js, vanilla JS | Preact: React-shaped API keeps ecosystem/maintainability high while staying small. Svelte is the leaner alternative if bundle size matters more than ecosystem to you. Next.js rejected: no SSR/SEO need since the app sits behind auth, and its server-oriented model fights an offline-first design rather than helping it. |
| D3 | Hosting | Cloudflare Pages | Vercel, Netlify | Unlimited free-tier bandwidth removes surprise-bill risk; strongest CDN reach helps first-load speed on weak connections. |
| D4 | Auth model | One Supabase account per shop + app-level staff PIN | Individual Supabase accounts per staff member | PIN is far lower friction for a 1-3 person shop opening the app dozens of times a day; explicitly not a hard security boundary (see section 4). |
| D5 | Reminders | In-app "due today" dashboard | OS push notifications | Push reliability on iOS is conditional (home-screen install required, version-gated) and fundamentally can't be guaranteed for an offline-first app anyway. |
| D6 | WhatsApp integration | `wa.me` pre-filled links (manual send) for v1; Cloud API automation on roadmap | Automated Cloud API sending in v1 | Zero infrastructure, zero cost, ships immediately. Automation needs a backend (token can't live client-side) -- deferred until it's clear manual sending is actually a bottleneck. |
| D7 | Data safety | Explicit in-app "Export backup" (JSON) | Relying on browser storage persistence alone | Browser-stored data isn't guaranteed permanent (documented risk, not an edge case); cheap to build, meaningfully reduces data-loss risk. |
| D8 | Stock/catalogue model | Item-type + quantity, not individual physical pieces | Per-item unique tracking | Matches how shop stock actually works (multiples of the same design/size); scoped to rental/purchase orders only, tailor-made stays bespoke. |


## 7. Deployment topology

There is no custom backend server anywhere in this system. The browser talks directly to Supabase's managed APIs (REST via PostgREST, WebSocket via Realtime) and to Cloudflare Pages for static assets. This keeps operational surface area to two managed services, both with usable free tiers at this app's expected scale, and nothing for anyone to patch, restart, or keep running.

```
Build:   vite build  ->  static assets (dist/)
Deploy:  push to main  ->  Cloudflare Pages auto-deploy
Runtime: browser <-> Cloudflare Pages (assets, cached by service worker)
         browser <-> Supabase (data, direct from client, governed by RLS)
```


## 8. Known limitations (carried forward deliberately, not oversights)

- PIN-based staff attribution is not real per-person security (section 4).
- Conflict resolution for simultaneous offline edits to the same record has a defined mechanism (RxDB/Supabase's built-in handling) but has not yet been deliberately tested end-to-end -- flagged as a Phase 0 verification step, not assumed safe.
- No automated WhatsApp reminders in v1 -- manual-tap only, by design, revisited later.
- No rental inventory availability tracking until Phase 2.
- Framework choice (Preact vs Svelte, decision D2) is a working default, not a final confirmed answer from you.


## Companion documents

- `pwa-research-notes.md` -- full research, sources, and reasoning behind each architectural choice
- `pwa-schema-and-screens.md` -- complete field-level schema and screen-by-screen UI design
- `pwa-stack-options.md` -- concrete tool/library choices and why
- `IMPLEMENTATION_PLAN.md` -- phased build plan and verification checklist
