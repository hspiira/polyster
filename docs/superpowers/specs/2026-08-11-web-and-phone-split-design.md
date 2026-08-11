# Web and phone as two designs — design

Date: 2026-08-11
Status: approved, not implemented
Scope: the application shell, the navigation model, and how the codebase splits.
Supersedes the **Responsiveness** section of [`docs/DESIGN_SYSTEM.md`](../../DESIGN_SYSTEM.md).

## Where this sits

The redesign so far made *layout* adapt and left *density and interaction*
phone-only. `DataList` reflows on a container query, `Screen` caps a measure,
the tab bar swaps for a rail at `lg`. All of that works. None of it changes the
fact that every control on a 27-inch monitor is sized for a thumb.

This spec stops treating that as a conversion backlog and treats it as the
wrong architecture. One layout that has to be defensible at 320px and at 2560px
is a treaty, and a treaty is nobody's good design.

## The problem, as measured

Recorded first so the decisions read as answers to something specific, and
because each of these was measured on the build at `bde8f8b` rather than
asserted.

| # | Finding | Where |
|---|---|---|
| P1 | The 44px tap floor is applied at every size, and the comment says so out loud: "44px tap floor: below it mis-taps become common, mouse or thumb." 44px is a *thumb* minimum; a fine pointer wants roughly 32px. | `styles/theme.css` `--spacing-tap`, `ui/Button.tsx` `SIZES` |
| P2 | There is no pointer awareness anywhere in the codebase. One `@media (hover: hover)` rule exists, on `.data-row`. | `styles/components.css:65` |
| P3 | One `Escape` handler is the entire keyboard model. No list navigation, no shortcuts, no command palette. | `ui/Surface.tsx:94` |
| P4 | `DataList` has one adopter. `Clients` still renders every record twice — `Card lg:hidden` beside `DataTable` — which the design system's own rules forbid. | `screens/Clients.tsx:149,166` |
| P5 | At 834px, `Orders` shows a table and `Clients` shows phone cards. Same viewport, same kind of records, because one screen queries its container at 44rem and the other queries the viewport at 64rem. | measured in a browser |
| P6 | Sales, Expenses, `SaleForm` and the Reports profit card — the newest work — were all written against the compatibility shim, in the pre-redesign idiom. The debt grows faster than it is paid. | 19 files import `components/ui`, 2 import `src/ui` |

P1 and P2 are the spec's subject. P3 through P6 are symptoms of the same cause:
there is one design, so every screen negotiates.

## Decisions

| # | Decision | Rejected | Why |
|---|---|---|---|
| W1 | **Two designs, not one responsive layout.** A web application and a phone application, each designed on its own terms. | Finishing the container-query conversion; a third tablet design | A table that must survive becoming cards, and a button that must be defensible at both 32px and 44px, is a compromise at every step. A third design puts the compromise back in the middle. |
| W2 | **Split on pointer, not width.** `(pointer: fine)` gets the web design at any width; `(pointer: coarse)` gets the phone design at any width. | Splitting at a width breakpoint | Width is a poor proxy for the thing that actually decides control size. A 900px browser window is a desktop; a 1366px tablet held in two hands is not. Pointer asks the question directly. |
| W3 | **One URL space, two shells.** Routes are identical; the root mounts `WebShell` or `PhoneShell`. | Separate route tables; a `/app` and `/m` split | A link a shop owner sends themselves must open the right thing on either device. Two route tables guarantee they drift. |
| W4 | **Shared: tokens, domain logic, copy, permissions. Forked: layout, navigation, information architecture, density.** | Sharing components and parameterising them by platform | A component with a `platform` prop is the treaty again, one level down. The seam is the shell, not the button. |
| W5 | **The web design has no bottom navigation, at any width.** Application bar, grouped sidebar with counts and the primary action in it, page tabs, filter bar, table, inspector pane. | Hiding the tab bar above a breakpoint | Absent, not hidden. A design that contains a bottom bar it must suppress is still a phone design. |
| W6 | **The phone design keeps its bottom navigation and its task-first IA**, and opens on what is due rather than on the book. | Making the phone a narrow view of the web IA | These are different questions. At a counter, holding fabric: "what do I owe someone today". At a desk: "show me the book". The IA differs because the job differs. |
| W7 | **Density is a constant per design, not a runtime negotiation.** Web is 32px controls, 34px rows, 13px UI text, 6px radius. Phone is 44px, 56px rows, 15px, pill. | A `--density` token both shells read | Once the shells are separate there is nothing to negotiate. A token that can hold either value invites a component to handle both. |
| W8 | **Pure logic moves to `src/domain/`.** `todayModel`, `profit`, `orderStage`, `calculateBalance`, and the `lib/` calculators. | Leaving it under `db/` and `screens/` | Two shells must not derive a balance twice. This is the decision that makes two designs affordable, and the codebase is already most of the way there. |
| W9 | **The web build never imports `components/ui`.** The shim stays for the phone build until the phone redesign retires it. | Converting all 19 files first | Blocking the web design on a migration of the design it replaces is backwards. The shim becomes phone-only scaffolding with a clear owner and end date. |
| W10 | **A manual platform override, persisted**, resolved the way `data-theme` already is. | Detection only | Needed for testing both shells on one machine, and it is the escape hatch for whatever hardware reports its pointer oddly. |
| W11 | **`DataList` conversions stop until the web shell lands.** | Continuing in parallel | Every screen converted now gets converted again. `Orders` stays as the worked example. |

## Platform resolution

One decision, at the root, in a pure function:

```
type Platform = 'web' | 'phone'

resolvePlatform({ finePointer, override }): Platform
```

- `override` wins when set (`'web' | 'phone'`), from `localStorage`.
- Otherwise `finePointer ? 'web' : 'phone'`.

`finePointer` comes from `matchMedia('(pointer: fine)')`, which reports the
*primary* input. A touchscreen laptop reports `fine` because its mouse is
primary, which is the answer we want. An iPad with a trackpad attached reports
`fine` and switches to the web design live, which is also the answer we want,
so the media query is subscribed to rather than read once.

The function is pure and takes booleans so it can be tested without a DOM, the
same shape as `lockPolicy.ts` and `entryState.ts`.

## How the codebase splits

```
src/
  domain/        pure logic, no DOM, no RxDB      shared, tested once
  db/            RxDB, replication, writes         shared
  ui/            tokens + primitives               shared
  web/           WebShell, tables, inspector       fine pointer
  phone/         PhoneShell, cards, sheets         coarse pointer
  components/ui  compatibility shim                phone only, delete on phone redesign
```

`src/domain/` takes the modules that already are pure: `todayModel.ts`,
`profit.ts`, `orderStage.ts`, `money.ts`, `dates.ts`, `orderReference.ts`, and
`calculateBalance`/`signedAmountMinor` from `balances.ts`. The observable half
of `balances.ts` (`observeBalance`, `observeShopBalances`) stays in `db/`,
because it takes a database handle and is therefore not domain logic. That
split is the one piece of the move that is not mechanical.

## The web design

```
┌──────────────────────────────────────────────────────────────┐
│ NT Polyster   Nakato Tailoring ▾      ⌕ Search      ⌘K   ◐ NG │
├────────────┬─────────────────────────────────┬───────────────┤
│ + New order│ Work / Orders                   │ Wedding gown  │
│            │ Orders                          │ Achen J.      │
│ WORK       │ ─────────────────────────────── │ ───────────── │
│ Today    5 │ All · Due this week · Unpaid    │ Balance due   │
│ Orders 142 │ [Open 14][Overdue 3] Filter ⋯   │ USh 300,000   │
│ Clients 86 │ ┌─────────────────────────────┐ │ ▓▓▓▓░░░░░░    │
│            │ │ ☐ Order  Client  Stage  Owed│ │ Stage  Ready  │
│ MONEY      │ │ ☑ Wedding gown … 300,000    │ │ Units 3       │
│ Sales   31 │ │ ☑ Kitenge dress … 120,000   │ │ ───────────── │
│ Expenses 12│ │ ☐ Rental tux · return       │ │ [Take payment]│
│ Reports    │ └─────────────────────────────┘ │               │
│            │ 1–9 of 142            ‹ 1 2 3 › │               │
│ ◉ Synced   │                                 │               │
└────────────┴─────────────────────────────────┴───────────────┘
```

What the phone design has no equivalent of, and which is the point of building
it: global search, row selection with bulk actions, sortable and configurable
columns, pagination, hover row actions, and an inspector pane so opening a
record does not cost you the list.

## The phone design

Unchanged in intent from what ships today, which is a decent phone app. It
opens on Today, leads with a two-clause statement of what is late and what is
owed, groups work into urgency buckets, and puts four destinations and one
create action in a floating bar. This spec does not redesign it; it stops it
being stretched.

## Keyboard, which the web design requires

Not optional, and not a later polish pass: it is most of what separates a
back-office from a website.

| Keys | Action |
|---|---|
| `⌘K` / `Ctrl-K` | Search everything |
| `↑` `↓` | Move through rows |
| `Enter` | Open the focused record |
| `Space` | Select the focused row |
| `N` | New order |
| `P` | Take payment on the open record |
| `Esc` | Close, deselect, or go back |

Focus must be visible at every stop; `index.css` already draws one
`:focus-visible` ring for the whole app and that stays the only one.

## Testing

`resolvePlatform` is pure and gets `platform.test.ts` alongside it, matching
`lockPolicy.ts`. Cases: fine pointer, coarse pointer, each override against
each detection, and an unset override.

The `src/domain/` move must not change a single test. If the suite needs
editing beyond import paths, the move was not a move.

Neither shell gets component tests, consistent with `ARCHITECTURE.md` §11.

## Consequences and subtractions

1. **Two shells and two sets of screen layouts is more code**, and it can
   drift. The protections are W4 and W8: everything derived is shared and
   tested once, and the design language is one file.
2. **`DESIGN_SYSTEM.md`'s "Responsiveness" section is wrong after this** and
   must be rewritten. "Container queries before viewport ones" survives *within*
   a shell; "adapt to available space, not window size" no longer describes how
   the app chooses a design.
3. **A tablet without a keyboard gets the phone design across a large screen.**
   The phone design caps its measure and centres, which is honest but not
   generous. See Risks.
4. **The web build is new work, not a conversion.** None of the 19 shim-based
   screens are reused by it.

## Risks

**The iPad case is the weakest part of W2.** A 12.9-inch tablet with no
keyboard reports a coarse pointer and gets a phone design centred in a large
screen. That is defensible — the input really is a thumb — but it is the
scenario most likely to make someone say the app is wrong. W10's override is
the mitigation, and a tablet treatment is recorded as deferred rather than
denied.

**Pointer detection is unverified on real hardware.** Consistent with
`ARCHITECTURE.md` §11 and `X2`, every claim above about what `(pointer: fine)`
reports on a touchscreen laptop and on iPadOS is a desk claim. It needs a device.

**Two designs can drift in copy as easily as in logic**, and copy is not
covered by W8. Terminology lives in the domain modules where it can (stage
labels, category labels); anything else is discipline.

## Deferred

- **A tablet treatment.** Explicitly not a third design. If it happens it is the
  phone design given a wider grid, never the web design given bigger controls.
- **Retiring `components/ui`.** Belongs to the phone redesign, which this spec
  does not schedule.
- **The `ProfitCard` payment-scoping defect** (`Reports.tsx:198` passes every
  local payment into `profitAndLoss`, unscoped, while `collected` on the same
  screen filters by `orderIds`). It is a correctness bug, not a layout one, and
  should be fixed independently rather than folded into this work.

## Open items

- **W2 is the load-bearing decision and was taken on a recommendation, not a
  measurement.** It is reversible in `resolvePlatform` alone. Worth revisiting
  once both shells exist and can be held on real hardware.
- **Whether Sales and Expenses stay grouped under Money** in the web sidebar, or
  become top-level alongside Orders.
- **Whether the web sidebar is user-collapsible.** Drawn expanded; collapsing is
  a convention, not a need, and costs a persisted preference.
