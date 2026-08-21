# Status

Where the project is, what evidences it, and what is open. **This is the entry
point for "what is next".** It replaced `IMPLEMENTATION_PLAN.md` and the live
half of `CODE_REVIEW.md` on 2026-08-21, because three documents tracking open
items meant three documents going stale at different rates — which is exactly
what happened in August.

If you ship work and do not update this file in the same commit, it becomes
actively misleading rather than merely incomplete. That has happened once.

**Last revised:** 2026-08-22, after backup import. Open items are planned in
`superpowers/plans/2026-08-22-durability-and-gaps.md`; this file stays the index
of what is open, that file carries the sequencing and the decisions.

## Feature phases

Every numbered phase in `POLYSTER.md` has shipped, and its own final acceptance
test (§89) passed live on 2026-08-12. §90 draws the product boundary rather than
adding scope, so there is no remaining feature phase.

| Phase | Spec | State |
|---|---|---|
| 0 — Foundation verification | §71 | Done, verified live |
| 1 — Tenant configuration | §72 | Done |
| 2 — Catalogue | §73 | Done |
| 3 — Suppliers & materials | §74 | Done |
| 4 — Inventory | §75 | Done |
| 5 — Production | §76 | Done |
| 6 — Collections | §77 | Done |
| 7 — Pre-orders & corporate | §78 | Done |
| 8 — Garment identity | §79 | Done |
| 9 — Repairs | §80 | Done |
| 10 — Garment passport | §81 | Done |
| 11 — Advanced reporting | §82 | Done |
| 12 — Permissions | §83 | Done |
| Storage switch to Dexie | — | Done 2026-08-21, `superpowers/plans/2026-08-21-dexie-switch.md` |

## What is checked, and where

| Check | Where |
|---|---|
| Typecheck, lint, tests, standards, build | `pnpm verify` |
| On every push and pull request | `.github/workflows/verify.yml` |
| Accessibility and hook rules | `eslint.config.js`, inside `pnpm verify` |
| Model-to-screen wiring, in a real browser | `pnpm test:e2e` |
| RLS structural preconditions | `pnpm verify:rls` |
| Migrations and seed, against a real Postgres | `pnpm verify:schema` |
| A write and a read with the network off | `run-polyster` skill, by hand |
| Design-system rules | `scripts/check-standards.mjs` |

49 test files, 759 tests, `pnpm verify` green. 21 migrations under
`supabase/migrations`, none of which the app reads for shop data any more, but
all of which now apply to a throwaway database on demand.

`check-standards.mjs` is a guard script, not a linter: it enforces the
`DESIGN_SYSTEM.md` colour rules and the two-line comment ceiling lexically.
ESLint carries what needs an AST.

### What the Phase 0 sign-off rests on

Three tenants created in one Supabase project simultaneously rather than
sequentially, a 38-check live pass covering every ability each tenant's
acceptance list names, and isolation checked across six tables with a
service-role ground-truth query (`POLYSTER.md` §89).

Two real gaps surfaced in that pass and were closed rather than routed around:
rental deposits could not be taken or refunded at all, and a refunded-at
timestamp used `formatDate()` where it needed `formatDateTime()`. Both predated
every phase in the spec, and both surfaced only because something exercised the
flow end to end. **Reading the code does not verify the code.**

## Open, in order of value

### 1. There is no sync

Replication went with RxDB on 2026-08-21 and has not been rebuilt. A shop's data
lives on one device, and the backup export is the only way off it. Two devices
cannot share a shop.

This is the largest open item in the project, and it makes item 2 urgent rather
than tidy.

The id question is settled (2026-08-22): ids stay cuid2 and our own id columns
are `text`, verified by `pnpm verify:schema`. Only `shops.supabase_auth_user_id`
is still `uuid`, because Supabase owns it. The offline-conflict question returns
with sync; it is deferred, not answered.

### ~~2. Backup exports but cannot import~~ — done 2026-08-22

`parseBackupText` reads a file, `restoreBackup` applies it as one transaction,
and the entry point is on the **landing screen** as well as in Settings: a
replacement phone has no shop, so it can never reach Settings. Found by wiping a
device and discovering the restore screen was unreachable.

Replace only. Merge needs a conflict rule and waits for sync.

### ~~Audit log and importer footprint~~ — done 2026-08-22

Was never in this list; it was created by the storage switch and found by
measuring. Events carried a full copy of every row on both sides, at 8.7× the
data they described. Now 2.84×, and the default backup is half the size. The
RxDB importer runs once rather than on every launch, and deletes what it read.

### 3. Nothing has run on real hardware

Every screen has been driven in a headless desktop browser at phone dimensions,
which simulates a phone. The install-and-airplane-mode checks from the original
Phase 0 list rest on sign-off, not on an artifact in this repo. Both Android and
iPhone are expected among shop owners, and iOS installs differently
(`ARCHITECTURE.md` §8).

### 4. The PIN cost is extrapolated, not measured

`DEFAULT_ITERATIONS` is 210,000, scaled from a desktop timing. `measureHashMs`
and `recommendIterations` are wired to the lock screen behind
`import.meta.env.DEV`, so the whole procedure is `pnpm dev --host` opened on the
shop's phone. Nobody has run it on the lowest-end handset.

### 5. A screen-reader walk of the back-office tail

The mechanical class of accessibility bug is a lint error and cannot silently
return; `pnpm test:e2e` covers 18 assertions on the entry flow. What is left is
someone actually listening to the long tail of back-office screens.

## Carried deliberately, not oversights

- PIN-based staff attribution is not real per-person security (`ARCHITECTURE.md` §4).
- Self-service shop creation (D14) has no reconciliation if a device creates a shop locally while its account also has an admin-provisioned one.
- The balance calculation exists twice: the Postgres view and `src/db/balances.ts`. Both tested; a change to one has to be made to the other.
- The Dexie schema is at `version(1)`. Adding a store or an index needs a `version(2).stores(...)` in the same commit, or an installed app cannot open its own database.
- No automated WhatsApp reminders — manual-tap only, by design.
- No rental inventory availability tracking.
- Zero `.test.tsx` files, and `vitest` runs in `environment: 'node'`. Screen behaviour is covered by `pnpm test:e2e` against a real browser instead, which tests something component tests structurally could not: the pointer-type shell split.
- Three raw `order_type ===` comparisons remain and should stay. `repairMetrics.ts` filters repairs because that is the module's whole purpose; `OrderForm`'s two are feature-flag gating, not statements about what a type needs.
- A purchase order's date is "Handover date" in `dueDateLabel` but "Pickup" in the short label. Left alone deliberately — reconciling it changes what a shipped screen says.

## Deployment

1. Push the repository to a git host.
2. Connect it to Cloudflare Pages. Build command `pnpm build`, output directory `dist`.
3. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the Pages project settings. Never commit them. They are build-time variables baked into the bundle, not runtime secrets; the anon key is designed to be public, and RLS is what protects the data, which is why the policies in the migrations are load-bearing rather than defence in depth.
4. Every push to main auto-deploys. HTTPS is required for installability and Pages provides it by default.
5. Optional: attach a custom domain.
