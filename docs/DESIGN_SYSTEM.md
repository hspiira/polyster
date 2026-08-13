# Design system

**Status:** Colour is fully migrated — as of 2026-08-14 no file outside
theme.css names a colour and no `dark:` utility exists, both enforced by
`pnpm verify`. The `@custom-variant dark` scaffolding in `index.css` is deleted.
The *import* migration is still in progress: 22 screens import the shim at
`src/components/ui.tsx`.

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

A `<Card lg:hidden>` beside a `<DataTable>` means two sets of markup and two
sets of derived values, free to disagree. Describe the record once as
`Column[]` and hand it to `DataList`; both presentations are CSS layouts of the
same DOM.

## `warning` is not `money`

Amber is money and only money, so a stalled sync cannot borrow it. `warning`
(hue 55, between danger's 27 and money's 75) is the "needs attention, nothing
has failed" status: offline, unsynced, only-on-this-phone. If you reach for
amber and the subject is not a balance, you want `warning`.

## Converting the remaining screens

Colour is already done everywhere. What is left is the import path:

1. `from '../components/ui'` → `from '../ui'`
2. The `Card lg:hidden` + `DataTable` pair → one `DataList`

`src/components/ui.tsx` is the last piece of migration scaffolding, and gets
deleted when nothing imports it. `src/screens/Orders.tsx` is the worked example.
