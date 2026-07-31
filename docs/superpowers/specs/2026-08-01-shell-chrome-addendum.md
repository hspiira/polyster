# Shell chrome — addendum to the S1 design

Date: 2026-08-01
Status: approved, in implementation
Amends: [`2026-07-31-internal-ia-today-design.md`](2026-07-31-internal-ia-today-design.md)

Written after seeing S1 running. Four complaints, all about chrome rather than
content, plus two spec corrections the S1 final review left owing.

## What was wrong

| # | Complaint | Where |
|---|---|---|
| A1 | The empty state is a bordered card holding a bordered icon box holding text, anchored to the top with most of the viewport empty beneath it. The container earns nothing. | `ui.tsx` `EmptyState`, and every caller that wraps it in a `Card` |
| A2 | Page titles repeat the tab bar. "Today" appears in the header and again in the nav, inches apart. | `Screen`, all four tab roots |
| A3 | The nav is a full-width slab across the bottom edge. | `TabBar.tsx` |
| A4 | The profile is a 28px circle in a thin strip — a link, not a presence. | `Shell.tsx` |

## Decisions

| # | Decision | Why |
|---|---|---|
| A5 | **Floating pill nav.** Inset from all three edges, fully rounded, translucent over a backdrop blur. | Matches the reference samples. A bar welded to the screen edge reads as system chrome; a floating one reads as part of the app. |
| A6 | **Active tab only carries its label.** Inactive items are bare icons; the active one becomes a filled pill with icon + label. | Resolves the standing conflict between the reference's icon-only bars and `TabBar`'s own argument that untrained staff need labels. You always see where you are, and only once. |
| A7 | **The create action stays in-bar, not raised.** | Unchanged from the S1 fix. Raised, it overhung its own stacking context and covered the order form's submit button. |
| A8 | **Tab roots render no page title.** Pushed screens keep title and back. | Closes A2. With A6 the active label is already on screen; a title repeats it. An `h1` stays in the DOM, visually hidden, so the page keeps its heading. |
| A9 | **Today grows a profile header** — 44px avatar, "Hi, «first name»", sync state beneath, tapping through to Settings. It replaces both the page title and the strip avatar **on Today only**. | Closes A4 and A2 together. Both reference samples put identity at the top of the home screen and nowhere else. |
| A10 | **Other screens keep the thin status strip.** | The grown header is a home-screen affordance. Repeating it on every screen would cost a third of the viewport to say something the user already knows. |
| A11 | **`EmptyState` loses its card and its icon box.** Content centres in the space actually available, not in a box at the top of it. | Closes A1. |
| A12 | **Translucency is now shell-wide, not entry-only.** The floating nav and sticky headers sit on translucent, blurred surfaces. | Explicitly requested. Narrows entry-spec E6, which confined `.glass` to the entry flow — see Corrections. |

## Corrections to the S1 spec

These were owed from the S1 final review and are settled here rather than left.

- **N1 is superseded.** It specified a raised, brand-filled circle overhanging the tab bar's seam. That was reversed during implementation for a real reason (it covered the order form's submit button) and is now superseded again by A5–A7: a floating pill bar with the action in-bar.
- **The Primitives table is wrong.** It lists `Hero` and `DayStrip` as living in `ui.tsx`. They shipped in `src/screens/today/`, which is correct — they are Today-specific and belong beside their model. Read the table as covering `SectionCard`, `AccentRow`, `StatValue` and `MoreLink` only.
- **N13's amber rule has an exception.** Amber is reserved for money outstanding, but `Chip tone="warn"` and the stale-backup panel in `BackupSettings` use amber for warning. The rule is: amber-as-*figure* means money; amber-as-*chip-or-panel* means caution. S4 should either honour that split or change the offenders.
- **The app-wide visual change in `942760c`** — `--radius-card` 1rem→2px, all `--shadow-*` tokens deleted, borders and dividers removed — has no decision record. It is coherent and it ships, but S2–S4 will each re-litigate radius and dividers unless it gets one. **Still owed. Not resolved here.**

## Scope

`TabBar.tsx`, `Shell.tsx`, `ui.tsx` (`Screen`, `EmptyState`), `Today.tsx`, and the
title props on `Clients`, `Orders` and `Reports`. No schema change, no new
queries, no model change. Nothing in `src/screens/today/todayModel.ts` moves.

## Not in scope

Order and client screen layouts (S2, S3), the settings sub-screens (S4), and the
`942760c` decision record above.
