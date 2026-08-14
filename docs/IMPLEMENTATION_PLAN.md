# Implementation Plan

Companion to `ARCHITECTURE.md` and `POLYSTER.md`. This is the build sequence: what
gets built in what order, and how each phase gets verified before moving on.

**Last revised:** 2026-08-14, rewritten. The previous revision was dated
2026-07-30 and had gone badly stale: it recorded the catalogue as "not started"
when Phases 2 through 12 had all shipped, and listed currency as hardcoded when
it had been parameterised. Treat anything in git history before this date as
superseded.

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
| Phase 2 - Catalogue | §73 | Done, online-only |
| Phase 3 - Suppliers & Materials | §74 | Done, online-only |
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

One caveat, recorded rather than smoothed over. Section 89 evidences the
Supabase, tenant-isolation, and per-tenant ability items. The device-install
items from the original Phase 0 checklist (home-screen install on Android and
iPhone, airplane-mode load, offline-then-sync) rest on sign-off, not on a
recorded artifact in this repo. If you want them evidenced, add the artifact.

## Verification in place

| Check | Where |
|---|---|
| Typecheck, tests, standards, build | `pnpm verify` |
| On every push and pull request | `.github/workflows/verify.yml` |
| RLS structural preconditions | `pnpm verify:rls` |
| Design-system rules | `scripts/check-standards.mjs` |

Current state as of 2026-08-14: 46 test files, 558 tests, `pnpm verify` green.
20 migrations under `supabase/migrations`.

`check-standards.mjs` is a guard script, not a linter. It enforces the two
`DESIGN_SYSTEM.md` colour rules and the two-line comment ceiling lexically.
The project still has no linter. See L3 below.

## What is left, in order

Nothing here blocks anything else, which is a different situation from every
previous revision of this document. Ordered by value, not by dependency.

**L1. Accessibility audit outside the entry flow.**
The entry flow and the payment forms were fixed and checked during the
entry-flow work. The rest of the app has never been audited: form errors tied
to their field via `aria-invalid` and `aria-describedby`, status changes
announced, focus moved on navigation. This is most of the app.
**Done when:** every screen has been walked with a keyboard and a screen reader,
and the faults found are fixed rather than listed.

**L2. Component tests.**
There are 46 test files and all of them are `.test.ts`. There are zero
`.test.tsx`, and `vitest.config.ts` runs `environment: 'node'` with
`include: ['src/**/*.test.ts']`. The pure models are well covered. The screens
are covered by having been driven in a browser once, which does not survive a
refactor. The order form's validation and the dashboard's bucketing are the two
worth pinning down first.
**Note:** this needs a DOM environment and a component testing library added
first, so it is a larger step than it looks.

**L3. A linter.**
Still none. `strict`, the tests, and `check-standards.mjs` carry most of the
weight, so this stays lower value than it sounds, but it is cheap.

**L4. Decide whether backup needs a restore.**
`src/lib/backup.ts` exports and has 17 tests. It has no restore path, and the
screen says so outright. That is honest and it is not a backup strategy. Either
build the import, or decide the real recovery path is Supabase and say so in the
UI. This got sharper when registration stopped requiring a phone number: a new
shop's only copy of its data is local until it is claimed.

**L5. Measure the PIN iteration count on real hardware.**
210,000 iterations was measured on a desktop at roughly 190ms and extrapolated
to a low-end phone. An extrapolation is not a measurement. Target roughly 250ms
on the lowest-end Android the shop actually uses. The hash format is
self-describing, so the cost can be raised without invalidating anyone's PIN.
**Status: unverified.** Nothing in this repo records a measurement.

**L6. Carry-overs from `CODE_REVIEW.md`.**
That document's own "What to do, in order" is fully closed. Four things remain
in its "What is left" section: order-type branching in five files and stage in
eight (a rule for new code, not a repair), the accessibility pass above,
`supabaseClient.ts` as the last untested module, and `PinRecovery` keeping its
own copy of the PIN choose-and-confirm dance.

## Architecture notes this plan depends on

**Not everything is local-first.** The original design was offline-first
throughout. Phase 2 pivoted the catalogue to an online-only architecture, and
Phases 3 through 11 followed. `src/online/` holds those modules and
`src/hooks/useOnlineFeature.ts` gates them. The local-first RxDB core is
customers, orders, payments, and their derivations.

This is load-bearing and `ARCHITECTURE.md` does not mention it. See D1 below.

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
- **Stage/history atomicity.** Not achievable in RxDB. History is written first
  so a failure is visible rather than silent (D13).
- **Currency.** Parameterised. `src/lib/money.ts` takes a currency throughout and
  derives decimal places from ICU rather than a hand-maintained table; `shops`
  carries a currency column. Closes the old X5.
- **Offline double-booking.** Dissolved rather than decided. The catalogue went
  online-only, so the two-offline-devices case the old plan worried about cannot
  arise for it.

## Decisions still open

| Decision | Blocks | Task |
|---|---|---|
| Whether backup needs a restore path | Nothing yet, but the UI is making a promise it does not keep | L4 |
| Whether the online-only split is the intended end state or a staging post | Any future offline work on those modules | D1 |

Neither should be resolved by whoever happens to reach it mid-screen. Both are
written down here because defaulting quietly is how they turn into things nobody
remembers choosing.

## Documentation debt

**D1. `ARCHITECTURE.md` does not describe the online-only split.** The document
still reads as though the whole app is offline-first. That was true when it was
written and is not true now. Anyone reading it to decide how to build a new
module will build the wrong thing.

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
