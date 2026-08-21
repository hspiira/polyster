# Implementation Plan

Companion to `ARCHITECTURE.md` and `POLYSTER.md`. This is the build sequence: what
gets built in what order, and how each phase gets verified before moving on.

**Last revised:** 2026-08-21, for the storage switch. Treat anything in git
history before 2026-08-14 as superseded.

## Two numbering schemes, and which one is live

This is the single biggest source of confusion in the older revisions, so it is
stated first.

- **The original PWA build** used Phase 0 (infrastructure), Phase 1 (core v1),
  Phase 2 (catalogue). This is the numbering the pre-2026-08-14 revisions of
  this file used. It is **retired**.
- **The platform build** uses Phase 0 through Phase 12, defined in
  `POLYSTER.md` sections 71 to 83. This is the **live** numbering, and it is
  what commit messages since 2026-08-02 refer to.

Where this document says "Phase N" without qualification, it means the
POLYSTER.md numbering.

## Status at a glance

| Phase | POLYSTER.md | State |
|---|---|---|
| Phase 0 - Foundation Verification | §71 | Done, verified live |
| Phase 1 - Tenant Configuration | §72 | Done |
| Phase 2 - Catalogue | §73 | Done |
| Phase 3 - Suppliers & Materials | §74 | Done |
| Phase 4 - Inventory | §75 | Done |
| Phase 5 - Production | §76 | Done |
| Phase 6 - Collections | §77 | Done |
| Phase 7 - Pre-Orders & Corporate | §78 | Done |
| Phase 8 - Garment Identity | §79 | Done |
| Phase 9 - Repairs | §80 | Done |
| Phase 10 - NORTH//FOUND Passport | §81 | Done |
| Phase 11 - Advanced Reporting | §82 | Done |
| Phase 12 - Permissions | §83 | Done |
| Final Acceptance Test | §89 | Passed live 2026-08-12 |

Every numbered phase in the master spec has shipped. The spec's own final
acceptance test has passed. There is no remaining feature phase in
`POLYSTER.md`; section 90 draws the product boundary rather than adding scope.

## Foundation verification, and what evidences it

Phase 0 is signed off as of 2026-08-14.

The recorded evidence is `POLYSTER.md` section 89: three tenants created in one
Supabase project simultaneously rather than sequentially (Kampala Bespoke
Tailors, City Rental Wear, NORTH//FOUND), a 38-check live pass covering every
ability each tenant's acceptance list names, and isolation checked across six
tables with a service-role ground-truth query.

Two real gaps surfaced in that pass and were closed rather than routed around:
rental deposits could not be taken or refunded at all, and a refunded-at
timestamp was rendered with `formatDate()` instead of `formatDateTime()`. Both
predated every phase in the master spec. They surfaced only when something
exercised the flow end to end instead of reading the code and assuming.

That is the lesson worth keeping: reading the code does not verify the code.

**Replication was evidenced, and then removed.** `pnpm verify:sync` proved rows
moved both ways against a live project, green 4/4 on 2026-08-14. The storage
switch on 2026-08-21 dropped replication, so that script could only ever fail
from then on and has been deleted rather than left to rot. What replaced it as
the load-bearing check is the offline pass recorded in
`superpowers/plans/2026-08-21-dexie-switch.md`: production build, service worker
installed, network genuinely unreachable, and a shop set up, an order taken and
a payment recorded anyway.

One caveat remains, recorded rather than smoothed over. The device-install items
from the original Phase 0 checklist (home-screen install on Android and iPhone,
airplane-mode load) rest on sign-off, not on a recorded artifact in this repo.
Those need a physical handset; nothing in a headless browser substitutes.

## Verification in place

| Check | Where |
|---|---|
| Typecheck, lint, tests, standards, build | `pnpm verify` |
| On every push and pull request | `.github/workflows/verify.yml` |
| Accessibility and hook rules | `eslint.config.js`, in `pnpm verify` |
| Model-to-screen wiring, in a real browser | `pnpm test:e2e` |
| RLS structural preconditions | `pnpm verify:rls` |
| A write and a read with the network off | `run-polyster` skill, by hand |
| Design-system rules | `scripts/check-standards.mjs` |

Current state as of 2026-08-21: 47 test files, 697 tests, `pnpm verify` green.
20 migrations under `supabase/migrations`, none of which the app now reads for
shop data.

`check-standards.mjs` is a guard script, not a linter. It enforces the two
`DESIGN_SYSTEM.md` colour rules and the two-line comment ceiling lexically.
The project still has no linter. See L3 below.

## What is left, in order

Nothing here blocks anything else, which is a different situation from every
previous revision of this document. Ordered by value, not by dependency.

**L1. Accessibility. Largely closed 2026-08-14, and enforced rather than audited.**
`eslint-plugin-jsx-a11y` runs in `pnpm verify`, so the mechanical class is a
build error and cannot silently return. The whole tree produced four findings,
all fixed rather than suppressed. `Field` publishes its hint and error ids
through context, so all 128 call sites gained `aria-describedby` and
`aria-invalid` untouched. `ui/Sheet` gained the focus management `web/Dialog`
already had, and `SyncBadge` became a live region.
**What is left:** a screen-reader walk of the long tail of back-office screens.

**L2. Screen coverage. Done differently than planned, 2026-08-14.**
The decision was to extend the existing Playwright driver rather than add a DOM
environment and a component-testing library. `pnpm test:e2e` runs 16 assertions
against the real app, and it tests something component tests structurally could
not: the pointer-type shell split. It shares its signup walk with the screenshot
driver through `app.mjs`. Kept out of `pnpm verify` because Chromium is a
per-machine install and verify runs on every push.
**Still true:** there are zero `.test.tsx` files and `vitest` is `environment: 'node'`.
That is now a choice rather than a gap.

**L3. A linter. Done 2026-08-14.** ESLint flat config with `typescript-eslint`,
`jsx-a11y`, and the two classic `react-hooks` rules. `check-standards.mjs` keeps
the lexical colour and comment rules; the linter carries what needs an AST. A
lint directive does not spend the two-line comment budget.

**L4. Backup restore. Reopened 2026-08-21, and now the most important item here.**
The 2026-08-14 resolution was that the recovery path is Supabase, so no JSON
import was needed. The storage switch removed replication, which removed that
recovery path. The backup file is now the *only* copy off a device and it still
cannot be imported. Either sync comes back or restore gets built; leaving both
undone means a lost phone is a lost shop.

**L5. PIN cost. Made measurable 2026-08-14; the number itself is still yours.**
`measureHashMs` times a real hash and `recommendIterations` scales the count to
the 250ms target, surfaced on the lock screen behind `import.meta.env.DEV`.
`pnpm dev --host`, opened on the shop's phone, is the whole procedure.
**Still open:** nobody has run it on the lowest-end handset, and
`DEFAULT_ITERATIONS` is still the extrapolated 210,000.

**L6. Carry-overs from `CODE_REVIEW.md`.** `supabaseClient.ts` now has 9 tests,
so every source module has a test file. Two remain, both recorded there as
deliberate: order-type branching in five files (a rule for new code, not a
repair) and `PinRecovery` keeping its own PIN choose-and-confirm, which needs the
four-stage wizard reworked rather than a component swapped.

## Architecture notes this plan depends on

**Everything is local-first again, as of 2026-08-21.** Phase 2 had pivoted the
catalogue online-only and Phases 3 through 11 followed; the storage switch
reversed all of it. `src/online/` is down to image upload and the public
garment passport, and `useOnlineFeature` is gone. See `ARCHITECTURE.md` §1a.

**Chunk size.** `CODE_REVIEW.md` records 536 kB as flagged by the build. That
figure predates the route-splitting work. The largest chunk is now
`supabaseClient` at 207 kB raw and 53 kB gzipped, with 104 precache entries
totalling roughly 1,036 KiB.

## Decisions closed

- **Preact vs Svelte.** Preact (`ARCHITECTURE.md` D2).
- **`order_stage_history`.** Included from the first migration.
- **Where balances are computed.** Client-side (D9).
- **Expired session while offline.** App stays usable, sync stops, UI says so (D10).
- **PIN hashing.** PBKDF2-HMAC-SHA256, per-staff salt, 210,000 iterations,
  self-describing hash format (D11). The cost itself is still unmeasured; see L5.
- **Routing.** `preact-iso` with history URLs, relying on the service worker's
  `navigateFallback` (D12).
- **Stage/history atomicity.** Achieved 2026-08-21. Dexie has a multi-store
  transaction, so a row and its audit event land together (D13).
- **Currency.** Parameterised. `src/lib/money.ts` takes a currency throughout and
  derives decimal places from ICU rather than a hand-maintained table; `shops`
  carries a currency column. Closes the old X5.
- **Offline double-booking.** Still not decided, and no longer dissolved. It was
  dissolved by the catalogue going online-only; the catalogue is local again. It
  cannot arise today only because there is no sync, so it returns with sync.
- **Local storage engine.** Dexie on IndexedDB (D1), replacing RxDB.

## Decisions still open

| Decision | Blocks | Task |
|---|---|---|
| Whether sync gets rebuilt, and on what | Multi-device shops, and any real backup story | Needs the id question settled first: cuid2 ids cannot go in a Postgres `uuid` column, so either those columns become `text` or ids go back to uuid |
| Whether `DEFAULT_ITERATIONS` should change | Nothing, until someone times it on the shop's phone | L5 |

Neither should be resolved by whoever happens to reach it mid-screen. Both are
written down here because defaulting quietly is how they turn into things nobody
remembers choosing.

## Documentation debt

**D1. ~~`ARCHITECTURE.md` does not describe the online-only split.~~ Closed
2026-08-14, then made moot 2026-08-21.** Section 1a named both data paths; there
is only one path now, and it says so.

**D3. The pre-build research documents were absorbed and deleted, 2026-08-21.**
`pwa-research-notes.md`, `pwa-stack-options.md` and `pwa-schema-and-screens.md`
described an RxDB architecture that no longer exists, and every open question in
them had closed. What survived -- the decision rationales, the corrections, and
the three installability traps -- is in `ARCHITECTURE.md`. The
implementation-agent master prompt went too: `POLYSTER.md` is a superset of it
and is the one being maintained.

**D2. This file drifted for two weeks and misreported the state of the
project.** The cause was that shipping updated `POLYSTER.md` and `CODE_REVIEW.md`
but not this one. Whichever document is the entry point for "what is next" has
to be updated in the same commit as the work, or it becomes actively misleading
rather than merely incomplete.

## Deployment

1. Push the repository to a git host.
2. Connect the repo to Cloudflare Pages. Build command `pnpm build`, output
   directory `dist`.
3. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as environment variables
   in the Cloudflare Pages project settings. Never commit them.
   These are build-time variables baked into the bundle, not runtime secrets. The
   anon key is designed to be public and is safe there. RLS is what protects the
   data, which is why the policies in the migrations are load-bearing rather than
   defence in depth.
4. Every push to main auto-deploys. Confirm HTTPS is active, required for PWA
   installability. Cloudflare Pages provides it by default.
5. Optional: attach a custom domain.
