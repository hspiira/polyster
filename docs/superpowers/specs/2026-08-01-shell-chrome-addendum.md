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
| A13 | **The nav shrinks to three: Today · ＋ · Book.** | Four destinations plus an action was still a slab of choices. Three is the reference's shape and leaves the bar genuinely small. |
| A14 | **Orders and Clients merge behind "Book"**, one destination with a segmented Orders \| Clients control at the top. | They are the same kind of thing: reference lists you look things up in. "Book" is the shop's own word — the order book. Cost: Clients is one tap deeper than it was. |
| A15 | **Reports and Settings leave the nav entirely** and hang off the Today profile header. | Reports is a weekly question and Settings is rare; neither earns permanent thumb real estate. A9's header is the door. |
| A16 | **Empty states get purpose-drawn line illustrations** in `icons.tsx`' existing stroke language — inline SVG, `currentColor`, one brand accent. | Chosen over duotone spots on cost: this app refuses web fonts because it runs on cheap phones over metered data, and that reasoning applies to artwork. Line art in the existing language is ~1–2KB each, themes for free, and needs no dark-mode palette. |

### A14 in implementation: no new route

`Book` is **not** a new URL. `/orders` and `/clients` both keep working and both
render the same shell with its segmented control preselected. The tab points at
`/orders` and reads as active for both paths.

Doing it this way costs nothing and preserves every existing deep link — Today's
"See all" links, `?due=` and `?filter=` params, order-detail → client, and
`/orders/new?client=<id>`. A new `/book` route would have orphaned all of them
for no gain.

## Corrections to the S1 spec

These were owed from the S1 final review and are settled here rather than left.

- **N1 is superseded.** It specified a raised, brand-filled circle overhanging the tab bar's seam. That was reversed during implementation for a real reason (it covered the order form's submit button) and is now superseded again by A5–A7: a floating pill bar with the action in-bar.
- **The Primitives table is wrong.** It lists `Hero` and `DayStrip` as living in `ui.tsx`. They shipped in `src/screens/today/`, which is correct — they are Today-specific and belong beside their model. Read the table as covering `SectionCard`, `AccentRow`, `StatValue` and `MoreLink` only.
- **N13's amber rule has an exception.** Amber is reserved for money outstanding, but `Chip tone="warn"` and the stale-backup panel in `BackupSettings` use amber for warning. The rule is: amber-as-*figure* means money; amber-as-*chip-or-panel* means caution. S4 should either honour that split or change the offenders.
- **The app-wide visual change in `942760c`** — `--radius-card` 1rem→2px, all `--shadow-*` tokens deleted, borders and dividers removed — has no decision record. It is coherent and it ships, but S2–S4 will each re-litigate radius and dividers unless it gets one. **Still owed. Not resolved here.**

## Consequences

Stated plainly, because these remove things that work today.

1. **Clients is one tap deeper.** It was a destination; it is now a segment. The
   "phone rings, look someone up" job costs one extra tap. Watch this — if it
   turns out to be the most-used path, A14 is wrong.
2. **Reports loses its tab**, one working day after gaining it. It is now behind
   the Today profile header. S1's own N3 called that tab the weakest decision in
   the spec, so this is that prediction landing.
3. **Nothing in the nav says "Settings".** It is behind an avatar. The `TabBar`
   comment's argument about untrained users applies here and is being overruled
   on the grounds that Settings is rare, not that the argument is wrong.

## Scope

`TabBar.tsx`, `Shell.tsx`, `ui.tsx` (`Screen`, `EmptyState`), `Today.tsx`,
`Orders.tsx`, `Clients.tsx`, a new illustration module, and the title props on
the tab roots. No schema change, no new queries, no model change, **no new
routes**. Nothing in `src/screens/today/todayModel.ts` moves.

## Not in scope

Order-detail and client-detail layouts (S2, S3), the settings sub-screens (S4),
and the `942760c` decision record above.
