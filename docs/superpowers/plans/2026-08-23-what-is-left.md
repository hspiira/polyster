# What is left

Date: 2026-08-23
Status: **proposed**
Decision owner: Piira

## Where this starts

Every feature phase in `POLYSTER.md` shipped before 2026-08-21. Since then the
storage switch, backup import, the audit-log trim, sync in both directions, the
iOS full-screen fix and the monochrome palette have all landed. `pnpm verify` is
green at 852 tests, `pnpm verify:schema` clean, 18/18 e2e.

So what remains is not building. It is **four things that have never met
reality**, and a short list of cleanups.

The ranking below is by what would hurt most if it turned out to be broken, not
by effort.

## 1. Sync has never met a real server — and now it can

This is the largest thing built in this project and the least proven. The rules
are tested against a fake server, the SQL against a local Postgres. Nothing has
touched Supabase's own API, its auth, or its rate limits.

**The blocker I assumed was there is not.** `.env` holds a real project and
`/rest/v1/` answers — 401 unauthenticated, which is the correct response from a
live instance. So this is testable today.

What it needs, and why it needs your word first:

- Migrations `0021` and `0022` have to be applied to that project. They are
  **destructive**: `0022` drops `_deleted` from twenty-four tables, alters
  eighty-three id columns to `text`, and rebuilds `order_balances`. You said on
  2026-08-22 that the data there is disposable, but that was about the cuid2
  decision, and running these against a live project is a different act. I want
  it said again before I do it.
- Then: `pnpm seed:auth`, sign in as `owner@northfound.ug`, and watch one shop's
  work push and a second browser pull it.

**What I expect to break**, so it is on the record before it does:

- Supabase's PostgREST may not accept `.lte('updated_at', …)` on an update the
  way the guard assumes. If it silently updates nothing, every second push
  becomes an insert attempt.
- RLS is proved locally with a faked `auth.uid()`. A real JWT carries more, and
  `current_shop_id()` is a `security definer` reading `shops` — that is the one
  function where local and hosted can differ.
- The 500-row pull batch is untested against real network latency.

*Done when:* two browsers, one shop, a client created in one appears in the
other, and an edit to a different field of the same row on each merges rather
than clobbers.

## 2. Nothing has run on real hardware

Every screen has been driven headless at phone dimensions, which *simulates* a
phone. Three separate claims rest on that simulation and none is verified:

- **The iOS full-screen change.** `black-translucent` is what lets the app reach
  the top of the screen, and it makes iOS draw the clock and battery white.
  `StatusBarBleed` exists to keep something dark behind them. I have never seen
  iOS actually do this. The insets in the screenshots are faked by me.
- **The monochrome palette in daylight.** A near-black primary on a near-white
  page is high contrast on a calibrated monitor. A cheap phone screen at noon in
  Kampala is the test that matters, and it is the one the amber has to survive
  too.
- **Install and offline.** Android and iPhone install differently
  (`ARCHITECTURE.md` §8), and airplane mode on a device is not an emulated flag.

*Done when:* screenshots from both platforms are in the repo, and an order,
payment, stock movement and batch close have all happened with the radio off.

## 3. The PIN cost is a guess

`DEFAULT_ITERATIONS` is 210,000, scaled from a desktop timing. `measureHashMs`
and `recommendIterations` are already wired behind `import.meta.env.DEV`, so the
whole procedure is `pnpm dev --host` opened on the cheapest handset to hand.

Minutes of work, and it is the difference between a lock screen that feels
instant and one that feels broken. Bundled with 2 because it needs the same
device.

## 4. A screen-reader walk of the back-office tail

The mechanical class of accessibility bug is a lint error and cannot silently
return; `pnpm test:e2e` covers eighteen assertions on the entry flow. What is
left is a person listening to Catalogue, Inventory, Production, Collections,
Materials, Suppliers and the settings tail.

*Done when:* a written pass per screen, findings fixed or recorded as accepted.

## 5. Cleanups, none urgent

- **`LegacyTone` is three call sites from deletion.** `tones.ts` says it goes
  once every screen is converted: two `tone="alert"` and one `tone="good"` remain.
- **The brand ramp is mostly dead.** Eleven steps are still exported to Tailwind;
  seven direct uses remain in components, all of them identity — logomark, entry
  glow, splash. The middle of the ramp has no consumer.
- **`--warning` is an alias now.** Worth deciding whether the name survives at
  all, or whether those eight call sites should just say `money`.

## Carried deliberately

Recorded so they are not mistaken for oversights:

- **`asChild` over `linkTo`.** moat has it through Radix Slot and it is the more
  general answer. Polyster only ever needs an anchor, and across sixteen call
  sites the general form is more to write for generality nothing uses. The wart
  was the type narrowing, and that is fixed.
- **Compound `Card`.** moat composes Header/Title/Description/Action/Content/
  Footer where polyster passes three booleans. Converting touches every screen
  to change nothing a shop can see.
- **`data-slot` and `has-*`.** Genuinely elegant — moat's Card drops its footer
  padding by noticing a footer. Polyster has no footer slot to notice, so adding
  the attribute everywhere is speculative.
- **Per-field conflict resolution.** Row-level last-write-wins, guarded so an
  older write cannot overwrite a newer one. Two devices editing the same row at
  once loses the older edit rather than merging it. Per-field needs a timestamp
  per column on twenty-one tables; the case that actually happens in a shop is
  append-only and conflict-free either way.
- **Two devices, one account.** Auth is one shared login per shop
  (`ARCHITECTURE.md` §4), so the server cannot tell two devices apart. Per-device
  identity is an auth change, not a sync feature.
- **D14 reconciliation.** A device creating a shop locally while its account has
  an admin-provisioned one. Sync makes this reachable rather than theoretical; it
  needs its own answer.

## Order

1. **Say yes or no to migrating the live project.** Everything in 1 waits on it,
   and 1 is the only item where something large might be wrong.
2. **Sync against the real server** — a day if it works, longer if the guard
   behaves differently through PostgREST.
3. **A phone in hand**: 2 and 3 together, since they need the same device.
4. **4 and 5** whenever. Neither blocks anything.

The honest summary: nothing here is unbuilt. Four things are unproven, one of
them large, and the largest is now unblocked.
