# Code review: standards violations

Date: 2026-08-13
**Updated 2026-08-14** — items 1, 2, 5 and 6 of "What to do, in order" are done,
and the comment finding under "Known debt" was overruled. See the status box
below. Every count not marked "Now" is as it stood on 08-13.

> ## Status, 2026-08-14
> | Finding | Then | Now |
> |---|---|---|
> | Hardcoded colours | 254 | **0**, enforced |
> | `dark:` utilities | 93 | **0**, enforced |
> | Comment blocks over 2 lines | 355 in 159 files | **0**, enforced |
> | `@custom-variant dark` scaffolding | present | deleted |
> | `ui.tsx` shim imports | 22 | 22 (unchanged) |
> | `OrderDetail.tsx` | 900 | **246** |
> | `OrderForm.tsx` | 1,138 | **655** |
> | `CatalogueDetail.tsx` | 633 | **218**, 33 → 8 `useState` |
> | `writes.ts` / `schema.ts` | 1,031 / 798 | split per aggregate |
> | Copies of the PIN choose-confirm dance | 4 | **1 shared, 1 left** |
>
> `scripts/check-standards.mjs` runs in `pnpm verify`. The heavy-comment entry
> under "Known debt" below is **no longer accepted debt** — a two-line ceiling
> is now a rule. `src/lib/pin.ts`'s 60-line hashing rationale was moved to
> `ARCHITECTURE.md` §9b rather than deleted.
>
> Two things this surfaced that the review missed: the project had **no linter
> at all**, so "publish the rules as lint rules" meant introducing one; and
> `components.css` was naming `white`/`black` inside `color-mix()`, a rule-1
> breach the original count did not catch.
Scope: the whole of `src/` (29,263 non-test lines across 13 RxDB collections and
two shells), reviewed against SOLID, DRY, KISS, and the project's own written
rules in `docs/DESIGN_SYSTEM.md` and `docs/ARCHITECTURE.md`.

Every finding below is backed by a count or a file reference taken from the
current tree, not from impression. Where something looks like a violation but is
recorded as a deliberate trade-off, it is filed separately under "Known debt"
rather than counted against the code.

---

## Summary

| Area | State | Worst evidence |
|---|---|---|
| Single responsibility | **Closed** | was `OrderForm.tsx` 1,138 lines, 11 methods, 8 queries, 9 state hooks |
| Don't repeat yourself | **Poor** | The "what a client owes" rule written three times |
| Keep it simple | **Mixed** | `ui.tsx` shim still half-migrated; state explosion closed |
| Open/closed | **Mixed** | Order-type branching in 5 files, but `lib/orderTypes.ts` now exists |
| Interface segregation | **Good** | Props are narrow; `Pick<>` used where it matters |
| Dependency inversion | **Good** | `AuthDeps` injection, pure `lib/` modules, `db/` never imports screens |
| Own design-system rules | **Violated wholesale** | 93 `dark:` and 254 hardcoded colours against a stated rule of zero |
| Test coverage of logic | **Good where pure** | 40 test files; 5 modules untested, all at the edges |

The headline: the **pure core is well built and well tested**. The damage is
concentrated in the screen layer, which has been allowed to grow without any
extraction discipline, and in a design-system migration that stalled halfway and
is now going backwards.

---

## 1. Single responsibility

**Status: closed.** Recorded here as the before-and-after, since the numbers are
the point.

### 1.1 God components

| File | Was | Now |
|---|---|---|
| `src/screens/OrderForm.tsx` | 1,138 | 655, over `screens/orderForm/` + `orderFormModel.ts` |
| `src/screens/OrderDetail.tsx` | 940 | 246, over `screens/orderDetail/` (7 sections) + `orderDetailModel.ts` |
| `src/db/writes.ts` | 1,031 | split per aggregate under `db/writes/`, barrel only |
| `src/db/schema.ts` | 798 | split per aggregate under `db/schema/`, barrel only |
| `src/screens/CatalogueDetail.tsx` | 633 | 218, over `screens/catalogue/` |

The logic that mattered now lives in tested pure modules, which is what the
original finding was actually about: none of it was reachable by a unit test,
and the payment-cap bug existed precisely because a rule lived in two screens
where no test could see it.

`OrderForm.tsx` at 655 is still the largest screen. What remains is one long
render; its state and rules are in `orderFormModel.ts`.

### 1.2 State explosion

**Correction to the original finding.** This was recorded as "33 `useState`
calls in one component". That was wrong: it was 33 across *six* components in
one file. The count was right, the diagnosis was not, and the real fault was
different and worse.

`AddVariantSheet` and `EditVariantSheet` were near-identical: the same five
fields, the same seven state hooks each, the same validation and buttons,
differing only in which write they called. `VariantFields` took ten props, five
value/setter pairs, to serve both.

They are now one `VariantSheet` that creates when given no variant and edits
when given one, holding a draft object and three hooks. CatalogueDetail is
633 → 218 lines and 33 → 8 `useState`.

`StaffSettings.tsx` (17) and `ProductionBatchDetail.tsx` (20) have the same
shape, several sheets in one file, but no duplicated pair. Their state counts
are per-component and reasonable; only the file sizes are large.

---

## 2. Don't repeat yourself

### 2.1 The same money rule, written three times

"What a client owes" is implemented independently in:

- `src/screens/ClientDetail.tsx:70` (phone)
- `src/web/ClientDetailPage.tsx:56` (web)
- `src/web/ClientsPage.tsx:55` (web list)

All three currently apply the same rule: skip cancelled orders, sum balances
above zero. They **agree today**. That is luck, not design. Three copies of a
money rule with no shared test means the next change to it has three places to
land and two of them will be missed.

This is the same shape as the payment-cap bug: a rule with no single home.

**Fix.** `observeClientTotals(db, shopId)` beside `observeShopBalances` in
`src/db/balances.ts`, which both shells already import.

### 2.2 The choose-then-confirm PIN dance, written four times

Setting a PIN means typing it, typing it again, and starting over on a
mismatch. That two-phase flow, its `firstPin` holding state and its reset, was
written out at every place a PIN is set: `AddStaffSheet`, `ChangePinSheet`,
`LockSettings`, and `PinRecovery`.

Three of the four now use one `ChoosePinPad`, which owns the phases and the
mismatch reset and reports failures back to whatever styling the caller uses.
`PinRecovery` still has its own copy: it lives in the dark entry world with
different primitives and its heading is driven by a wider four-stage wizard.

### 2.3 Repeated guard clauses in the write layer

`src/db/writes.ts` contains **31** `findOne(...).exec()` calls and **15**
copies of the string `'... no longer exists on this device.'`.

**Fix.** One `loadOrThrow(collection, id, label)` helper. Fifteen call sites
collapse to one, and the message becomes editable in one place.

### 2.4 Search filtering re-implemented per screen

In-memory name/phone filtering appears separately in `Clients.tsx`,
`ClientsPage.tsx`, `ClientPicker.tsx`, `Catalogue.tsx`, `Materials.tsx`,
`Suppliers.tsx`, and five times inside `CommandPalette.tsx`. Several normalise
digits before matching; several do not, so the same query behaves differently
depending on which screen you type it into.

**Fix.** `matchesQuery(item, query, fields)` in `lib/`.

### 2.5 Event-target casting

**137** occurrences of `(e.target as HTMLInputElement).value`. This is noise
that the `Field`/`Input` primitives should have absorbed by exposing
`onValue: (value: string) => void`.

---

## 3. Keep it simple

### 3.1 Two parallel UI systems, indefinitely

`src/components/ui.tsx` is a 121-line shim whose own header says *"COMPATIBILITY
SHIM. Do not add to this file; delete it when nothing imports it."*

Current state: **22 files import the shim, 26 import `src/ui` directly.** The
migration is stalled at roughly halfway with no completion pressure, so every
new screen has to know which of two import paths to use and which of two styling
conventions applies. New files have been added on **both** sides since the shim
was written.

### 3.2 The design system's two rules are broken at scale

`docs/DESIGN_SYSTEM.md` states two rules:

> **1. No file outside `src/styles/theme.css` names a colour.**
> **2. No `dark:` utilities.**

Actual counts across `src/**/*.tsx`:

- **254** hardcoded palette colours (`stone-600`, `amber-700`, `red-400`, …)
- **93** `dark:` utilities

This is not drift, it is the rule being ignored. It also caused a real, shipped
defect: `--color-brand-*` was never published to Tailwind, so every
`bg-brand-500` in the entry flow compiled to transparent and the PIN dots
disappeared as the user typed. That bug was invisible precisely because colours
are named in 254 places instead of one.

### 3.3 A 98-line submit

`OrderForm.submit()` runs validation, creates or updates the order, diffs units
against the previous set, issues per-unit adds, updates and removes, then
applies the adjustment. It is a transaction script in a click handler, with no
rollback and no test.

---

## 4. Open/closed

Order type is branched on in five files (`OrderForm`, `OrderDetail`,
`todayModel`, `writes`, `repairMetrics`), and order stage in eight. Adding the
sixth order type means finding all of them.

This is **improving**: `src/lib/orderTypes.ts` now declares what each type needs
(`needsMeasurements`, `needsReturn`, `needsFulfilmentDate`, `dueDateLabel`) and
`orderStage.ts` holds labels, icons and the stage flow. The remaining branches
should move behind those two modules rather than new ones being added.

---

## 5. Other standards

### 5.1 Accessibility

Reviewed in detail during the entry-flow work. The recurring faults were:
form errors not tied to their field (no `aria-invalid` / `aria-describedby`),
status changes not announced, and focus never moved on step transitions. These
were fixed in the entry flow and the payment forms, and remain **unaudited
everywhere else**, which is most of the app.

### 5.2 Untested modules

Five source modules have no test file:

| Module | Risk |
|---|---|
| `src/lib/backup.ts` | **High.** It is the only path off the device for an unclaimed shop |
| `src/db/replication.ts` | **High.** Sync correctness |
| `src/lib/theme.ts` | Low |
| `src/lib/supabaseClient.ts` | Low, thin wrapper |
| `src/db/schema.ts` | Covered indirectly by `database.test.ts` |

`backup.ts` being untested is the one that should worry you. Registration no
longer requires a phone number, so a new shop's only copy of its data is local
until it is claimed, and `backup.ts` is the escape hatch.

### 5.3 Stray file

`scripts/_tmp-sync.mjs` is untracked and named as a temporary. It should be
named properly or deleted.

---

## Known debt, not violations

These look like faults but are recorded decisions, and the reasoning holds:

- **Two shells** (`src/screens` phone, `src/web` desk) are deliberate per
  `2026-08-11-web-and-phone-split-design.md`. The duplication that matters is
  *derivation* logic (section 2.1), not layout.
- ~~**Heavy comments.** The house style explains non-obvious decisions at
  length. That is a choice, and a defensible one.~~ **Overruled 2026-08-14.**
  Comment blocks are now capped at two lines and the cap is enforced. Long
  rationale goes in `docs/`, not in a header.
- **`ui.tsx` shim existing at all** was a sound migration strategy. Only its
  stalling is the problem.
- **Chunk size** (536 kB) is flagged by the build. Acceptable for now given the
  offline-first premise, but worth revisiting.

---

## What to do, in order

1. ~~**Publish the design-system rules as lint rules**, or delete the rules from
   the doc. A rule violated 347 times is not a rule.~~ **Done 2026-08-14** —
   `scripts/check-standards.mjs`, in `pnpm verify`. A guard script rather than
   ESLint: the project had no linter, and the rules are lexical.
2. **Extract `orderFormModel.ts` and `orderDetailModel.ts`.** These two files
   hold the most business logic and the least test coverage in the project.
3. **One `observeClientTotals`**, deleting three copies of the owed rule.
4. **Test `backup.ts`.** It is the only route off a lost phone.
5. **Finish or abandon the `ui.tsx` migration.** Twenty-two files, mechanical.
   Half-done is the worst of the three states.
6. Split `writes.ts` and `schema.ts` per aggregate.
