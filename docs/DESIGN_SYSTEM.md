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
· Status `accent` `money` `danger` `success` `neutral`, each with
`-soft` and `-on-soft` (always take the pair — a fill without its text has no
guaranteed contrast). `warning` still resolves, as an alias of `money`.
· Glass, for the fixed-dark entry flow: `glass-edge`, `glass-rule`
· Also `focus`, `scrim`, `shadow-raise|float|overlay`, `px-gutter`, `min-h-tap`,
`max-w-measure`, `max-w-wide`.

## Responsiveness

**Amended by `superpowers/specs/2026-08-11-web-and-phone-split-design.md`.** The
shell is chosen by pointer type, not viewport width: `(pointer: fine)` gets the
desktop shell, coarse gets the phone one. Resizing a window never switches
shells. What follows still governs layout *within* a shell.

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
| `money` | 0.540 | 0.855 | an outstanding balance, or work not yet sent |
| `success` | 0.455 | 0.775 | done, paid, synced |
| `danger` | 0.300 | 0.615 | overdue, destructive, failed |

Three roles since `--warning` folded into `money` (below), which widened the
smallest gap from 0.075 to 0.085. All six values clear 4.5:1 as text on their
own page.

**0.085 is not enough, and it cannot be fixed here.** Three semantic colours all
need AA contrast on a light page, which caps them around 0.55, and body text
holds 0.208 — 0.34 of room for three rungs that each want 0.15. It does not fit.
moat hit the same wall and its CSS records losing it: *"Contrast won instead …
That leaves them only 0.05 apart. Making --pos lighter fails WCAG AA there."*

So the ladder is a best effort and the redundancy rule below is what actually
carries the meaning. Measured in greyscale on 2026-08-23: the Orders list stays
readable because "10 days overdue" is **bold** as well as red, every stage is a
word, and every amount is prefixed `USh`. An amber amount and a green stage
label do land on the same grey — they are told apart by one being a number.

**`--accent` was the open one, and it is settled (2026-08-23).** It was a brand
hue at lightness 0.483, inside the same band as `success`, so a primary button
and a success state were one grey. It is now the **inverse of the background** —
near-black on the light page, near-white on the dark one — and the neutrals are
true greys at zero chroma rather than leaning toward the brand hue.

The rule that follows: **chrome is monochrome, colour belongs to money.** A
primary action can no longer be mistaken for a figure that went up, which is the
mistake a brand hue in the money band invites. Taken from moat, whose own CSS
states it plainly.

The brand hue survives where it is identity rather than chrome: the logomark,
the entry flow's glow, the splash. Nothing a shop taps to do work is coloured.

**There is one amber, not two.** `--warning` was its own ramp at hue 55 against
money's 75 — 20 degrees apart, where the rule on this page says 45. Worse, the
tone vocabulary had no `warning` at all: legacy `warn` resolved to `money`, so
the "only on this phone" card painted itself with money colours by accident.

Four semantic hues do not fit: danger, warning and money all want the warm half,
and no arrangement gets warning 45 degrees from both. So there are three, and
`--warning` now points at `--money`. Owed work and unsent work are the same
signal to a shop — look at this, it is not resolved.

That leaves ink, amber, red and green. The same shape as moat's.

**Controls shrink for a mouse.** 44px is the thumb floor and a back office full
of 44px controls reads as a phone app someone stretched. The `fine` variant is
`(pointer: fine)` — the same query `lib/platform.ts` picks the shell with, so a
control gets its desktop size exactly where the desktop layout appears rather
than at a width a touch tablet can reach.

`text-base` on inputs is load-bearing on touch: below 16px iOS zooms on focus and
does not zoom back. A mouse has no such behaviour, which is why the smaller text
lives behind `fine` and not behind a breakpoint.

## Adding a screen

Import from `../ui` and nothing else; there is no second path any more. Name
roles, never colours. Describe a record once as `Column[]` for `DataList` rather
than writing a card and a table. `src/screens/Orders.tsx` is the worked example.
