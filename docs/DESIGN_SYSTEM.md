# Design system

**Status:** Migrated, as of 2026-08-14. No file outside theme.css names a
colour, no `dark:` utility exists, and every screen imports `src/ui` directly.
The `@custom-variant dark` scaffolding and the `src/components/ui.tsx` shim are
both deleted. The colour rules are enforced by `pnpm verify`.

## The three rules

All three are enforced by `scripts/check-standards.mjs`, which runs in
`pnpm verify`. Run it alone with `pnpm check:design`.

**1. No file outside `src/styles/theme.css` names a colour.** Components ask for
roles — `bg-surface`, `text-content-muted`, `text-money`, `text-danger` — and
theme.css says what a role is worth in each theme. Re-skinning the app is
`--hue-brand`, one number. This covers palette names (`stone-600`), bare
`white`/`black` in CSS, and arbitrary values (`bg-[#0f1e52]`).

**2. No `dark:` utilities.** The theme is a `data-theme` attribute, resolved by
`src/lib/theme.ts` and bootstrapped inline in `index.html` so the first paint is
correct. Each role is written twice in theme.css and never again.

A subtree that must be one theme regardless of preference sets `data-theme`
itself — the entry flow does this on its shell, which is why it can ask for
roles rather than being exempt from them.

**3. No comment block longer than two lines.** A run of consecutive comment
lines, including a `═══` section banner. Reasoning that genuinely needs more
room goes in `docs/`, not in a header — `src/lib/pin.ts`'s hashing rationale
lives at `ARCHITECTURE.md` §9b for exactly this reason.

## Where things live

| | |
|---|---|
| `src/styles/theme.css` | Every colour, radius, space and type decision |
| `src/styles/components.css` | The few patterns that can't be utilities |
| `src/ui/` | Components. Import from `../ui`, never a file inside it |
| `src/lib/theme.ts` | Light/dark/system preference |

## Roles

Surfaces `page` `surface` `surface-raised` `surface-sunken` `hover` `pressed`
· Lines `line` `line-strong`
· Text `content` `content-muted` `content-subtle` `content-inverted`
· Status `accent` `money` `warning` `danger` `success` `neutral`, each with
`-soft` and `-on-soft` (always take the pair — a fill without its text has no
guaranteed contrast)
· Glass, for the fixed-dark entry flow: `glass-edge`, `glass-rule`
· Also `focus`, `scrim`, `shadow-raise|float|overlay`, `px-gutter`, `min-h-tap`,
`max-w-measure`, `max-w-wide`.

## Responsiveness

Adapt to available space, not window size:

- **Fluid before stepped.** `--gutter` and the display type scale are `clamp()`,
  so width changes are continuous. Body text is fixed — 16px inputs are what
  stop iOS zooming on focus.
- **`auto-fit` before breakpoints.** See `StatStrip`. A `grid-cols-2
  md:grid-cols-3` is nearly always a worse version of it.
- **Container queries before viewport ones.** `DataList` switches between card
  and table form on its own width, so it stays correct in a sidebar or a split
  view.
- **`lg:` is legitimate for navigation only** — floating tab bar below, side rail
  above. That genuinely is a viewport question.

## Rows pad by a fixed inset, not `--gutter`

`--gutter` is the *page* gutter and grows to 2rem on a desktop. A row inside a
`Card` is already inside it, so `px-gutter` on the row indents it twice — 4rem
before the first glyph. Rows use `ROW_INSET` (`src/ui/Row.tsx`). The exception
is a flush card, which cancels the page gutter with `-mx-gutter` and so does
want `--gutter` back — that is why `.data-row` still uses it.

## A setting that is on or off gets a `Switch`

Not a `Segmented` with On and Off in it. Two segments read as two choices to
compare rather than one thing that is either on or not, and cost two tap targets
and a row of chrome each. `Segmented` is for picking among three or more.

## Never render a record twice

Two sets of markup for one record, a card for narrow and a table for wide, means
two sets of derived values free to disagree. Describe the record once as
`Column[]` and hand it to `DataList`; both presentations are CSS layouts of the
same DOM.

## Nothing means anything by hue alone

The owner cannot reliably distinguish colours, and roughly 8% of male users
share that constraint. So every signal has to survive being rendered in
greyscale, and there are two halves to that.

**Colour is reinforcement, never the signal.** Whatever a colour says, something
else must say too — a word, a sign, a glyph, or presence against absence. This
already holds: an owed column shows a figure or "Paid", `formatDueDate` says "3
days overdue" in words, and money in and out carry `+`/`−` and an arrow. Keep it
holding. A red date with no other cue, or an amber figure whose only sibling is
another amber figure, is the shape to watch for.

**The semantic roles are separated in lightness, not only in hue.** Four roles
in one lightness band are one grey. They step instead, and the step reads as
intensity:

| Role | Light | Dark | Meaning |
|---|---|---|---|
| `money` | 0.540 | 0.855 | an outstanding balance, and nothing else |
| `success` | 0.455 | 0.775 | done, paid, synced |
| `warning` | 0.375 | 0.695 | needs attention, nothing has failed |
| `danger` | 0.300 | 0.615 | overdue, destructive, failed |

The smallest gap between any pair is 0.075, and all eight values clear 4.5:1 as
text on their own page. Amber is still money and only money, so a stalled sync
takes `warning` rather than borrowing it — but that distinction now survives
greyscale, which it did not when both sat at 0.545.

**`--accent` is the open one.** It is a brand hue at 0.483, inside the same band,
so a primary button and a `success` state are one grey. Fixing it properly means
having no brand hue at all: the primary surface becomes the inverse of the
background, which is how moat avoids the problem entirely. That is a visual
reset, not a token change, so it is a decision rather than a rule.

## Adding a screen

Import from `../ui` and nothing else; there is no second path any more. Name
roles, never colours. Describe a record once as `Column[]` for `DataList` rather
than writing a card and a table. `src/screens/Orders.tsx` is the worked example.
