# Design system

**Status:** In migration. Orders, Clients, ClientDetail, Settings and every
screen under `src/screens/settings/` are converted; 21 screens still import the
shim at `src/components/ui.tsx`.

## The two rules

**1. No file outside `src/styles/theme.css` names a colour.** Components ask for
roles — `bg-surface`, `text-content-muted`, `text-money`, `text-danger` — and
theme.css says what a role is worth in each theme. Re-skinning the app is
`--hue-brand`, one number.

**2. No `dark:` utilities.** The theme is a `data-theme` attribute on `<html>`,
resolved by `src/lib/theme.ts` and bootstrapped inline in `index.html` so the
first paint is correct. Each role is written twice in theme.css and never again.

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
· Status `accent` `money` `danger` `success` `neutral`, each with `-soft` and
`-on-soft` (always take the pair — a fill without its text has no guaranteed
contrast)
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

## Converting the remaining screens

1. `from '../components/ui'` → `from '../ui'`
2. The `Card lg:hidden` + `DataTable` pair → one `DataList`
3. Delete every `dark:` and every `stone-`/`amber-`/`red-` colour

`src/components/ui.tsx` and the `@custom-variant dark` line in `index.css` are
migration scaffolding. Both get deleted when nothing needs them.
