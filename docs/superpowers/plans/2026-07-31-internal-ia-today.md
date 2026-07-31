# Internal Navigation and Today Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the authenticated shell's navigation and the Today screen per
[`docs/superpowers/specs/2026-07-31-internal-ia-today-design.md`](../specs/2026-07-31-internal-ia-today-design.md),
including the fix for rental returns being invisible app-wide.

**Architecture:** All of Today's derivation moves out of the component into a
pure, fully-tested `src/screens/today/todayModel.ts`, following the
`orderStage.ts` + `orderStage.test.ts` pattern already in `src/screens/`. The
screen becomes a thin composition of new themed primitives. Navigation changes
are three independent edits: the tab bar gains a raised centre create action and
a Reports tab, Settings moves to the Shell's status strip, and `Fab` is deleted.

**Tech Stack:** Preact 10 + TypeScript (strict) + Tailwind CSS 4 + RxDB 17
(Dexie) + Vitest 4. No new dependencies.

## Global Constraints

- **No schema change and no migration.** `return_due_date` is already in
  `orderSchema` and already replicated.
- **No new RxDB queries.** Today keeps its three existing subscriptions.
- **Themed, not dark-only.** Every new surface supports `prefers-color-scheme`
  via the `dark:` variants used throughout `ui.tsx`. Do not import
  `GlowBackdrop` or use `.glass` / `.glass-inset` — those belong to the entry
  flow only (spec E6).
- **Amber (`text-amber-700 dark:text-amber-400`) is reserved for money
  outstanding** and nothing else (`src/index.css` header, decision N13).
  Due-today may use amber on an accent bar and count, never on a figure.
- **No uppercase text treatment** anywhere unless explicitly asked for
  (entry spec E12).
- **Minimum tap target is `min-h-11`** (the `TAP` constant in `ui.tsx`).
- **Comment length: a multi-line doc header at the top of a file is expected**
  (every existing file has one — see `schema.ts`, `balances.ts`, `ui.tsx`).
  **Comments inside a function, or beside a line, are capped at 1–2 lines.**
  Longer rationale goes in the spec, not the source.
- **Never assert `formatMoney()` output in a test.** It renders through
  `Intl.NumberFormat('en-UG', { style: 'currency' })`, whose symbol and
  grouping are ICU-build dependent. Compare against `formatMoney(n)`, never
  against a literal like `'USh 240,000'`. Narrow weekday names **are** asserted
  — they are stable for `en-GB` and catch off-by-one errors in the seven-day
  window.
- **Tests are `.ts` only.** `vitest.config.ts` sets
  `include: ['src/**/*.test.ts']` with `environment: 'node'` and no Preact
  preset, so there is no component-test harness. Presentational tasks gate on
  `pnpm verify`, not on unit tests. Do not add a component-test harness in this
  plan.
- **Commit at the end of every task.** Do not add Claude or AI co-authorship
  trailers to commit messages.
- **Verification command:** `pnpm verify` (= `tsc -b && vitest run && vite build`).

## File Structure

| File | Responsibility |
|---|---|
| `src/screens/today/todayModel.ts` | **Create.** Every derivation Today needs, pure. No Preact, no RxDB. |
| `src/screens/today/todayModel.test.ts` | **Create.** Unit tests for the above. |
| `src/screens/today/Hero.tsx` | **Create.** Renders `heroSegments()` output. Today-only. |
| `src/screens/today/DayStrip.tsx` | **Create.** The seven-cell workload strip. Today-only. |
| `src/screens/today/Today.tsx` | **Create.** The screen. Composes the model and the primitives. |
| `src/screens/Dashboard.tsx` | **Delete** in Task 7, replaced by `today/Today.tsx`. |
| `src/components/ui.tsx` | **Modify.** Add `SectionCard`, `AccentRow`, `StatValue`, `MoreLink`, `ACCENT_TONES`; add a `size` prop to `Avatar`; delete `Fab`. |
| `src/components/TabBar.tsx` | **Modify.** Four labels, two-and-two, raised centre create action. |
| `src/screens/Shell.tsx` | **Modify.** Status strip gains the Settings control; route `/` to `Today`. |
| `src/screens/Settings.tsx` | **Modify.** Remove the Reports row (it is a tab now). |
| `src/screens/Orders.tsx` | **Modify.** Read `?filter=` and `?due=`; drop `Fab`. |
| `src/screens/Clients.tsx` | **Modify.** Replace `Fab` with a `Screen` header action. |

`Hero` and `DayStrip` live under `src/screens/today/` rather than in `ui.tsx`
because they are Today-only. `SectionCard`, `AccentRow`, `StatValue` and
`MoreLink` go in `ui.tsx` because S2–S4 consume them. `ui.tsx` is already 528
lines; this adds roughly 90 and removes `Fab`'s 30.

## Task order

Tasks 1–4 build the pure model bottom-up. Task 5 adds primitives. Tasks 6–7
build the screen. Tasks 8–10 change navigation. **Every task leaves the app
building and usable** — in particular, Task 8 adds the centre create action
*before* Task 10 removes `Fab`, so there is never a commit with no way to take
an order.

---

### Task 1: Pure model foundations and the hero

**Files:**
- Create: `src/screens/today/todayModel.ts`
- Test: `src/screens/today/todayModel.test.ts`

**Interfaces:**
- Consumes: `formatMoney` from `src/lib/money.ts`; `OrderStage` from `src/db/schema.ts`.
- Produces: `OPEN_STAGES`, `HeroTone`, `HeroSegment`, `HeroCounts`, `heroSegments()`.
  Later tasks rely on these exact names.

- [ ] **Step 1: Write the failing test**

Create `src/screens/today/todayModel.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { heroSegments } from './todayModel'
import { formatMoney } from '../../lib/money'

const NONE = { late: 0, dueToday: 0, dueThisWeek: 0, outstanding: 0 }

describe('heroSegments', () => {
  it('leads with late work and names today alongside it', () => {
    const segments = heroSegments({ ...NONE, late: 2, dueToday: 3 })
    expect(segments).toEqual([
      { text: 'You have ', tone: 'muted' },
      { text: '2 late', tone: 'alert' },
      { text: ', ', tone: 'muted' },
      { text: '3 due today', tone: 'strong' },
    ])
  })

  it('reports late work alone when nothing else is due', () => {
    expect(heroSegments({ ...NONE, late: 1 })).toEqual([
      { text: 'You have ', tone: 'muted' },
      { text: '1 late', tone: 'alert' },
    ])
  })

  it('reports today when nothing is late', () => {
    expect(heroSegments({ ...NONE, dueToday: 3 })).toEqual([
      { text: 'You have ', tone: 'muted' },
      { text: '3 due today', tone: 'strong' },
    ])
  })

  it('falls back to the week when nothing is late or due today', () => {
    expect(heroSegments({ ...NONE, dueThisWeek: 4 })).toEqual([
      { text: 'You have ', tone: 'muted' },
      { text: '4 due this week', tone: 'strong' },
    ])
  })

  it('says nothing is due when no work is outstanding', () => {
    expect(heroSegments(NONE)).toEqual([{ text: 'Nothing due today', tone: 'strong' }])
  })

  // The money clause attaches with "and"; the work clause uses a comma, so no
  // sentence ever carries two "and"s.
  it('appends the money clause when something is owed', () => {
    const segments = heroSegments({ ...NONE, late: 2, dueToday: 3, outstanding: 240_000 })
    expect(segments.slice(-2)).toEqual([
      { text: ' and ', tone: 'muted' },
      { text: `${formatMoney(240_000)} owed`, tone: 'money' },
    ])
  })

  it('omits the money clause when nothing is owed', () => {
    const segments = heroSegments({ ...NONE, dueToday: 1 })
    expect(segments.some((segment) => segment.tone === 'money')).toBe(false)
  })

  it('reads sensibly when money is owed but no work is due', () => {
    expect(heroSegments({ ...NONE, outstanding: 5000 })).toEqual([
      { text: 'Nothing due today', tone: 'strong' },
      { text: ' and ', tone: 'muted' },
      { text: `${formatMoney(5000)} owed`, tone: 'money' },
    ])
  })

  // An overpaid order produces a negative balance. It must never surface as a
  // negative figure in the hero.
  it('ignores a non-positive outstanding total', () => {
    expect(heroSegments({ ...NONE, dueToday: 1, outstanding: -500 })).toEqual([
      { text: 'You have ', tone: 'muted' },
      { text: '1 due today', tone: 'strong' },
    ])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/screens/today/todayModel.test.ts`
Expected: FAIL — cannot resolve `./todayModel`.

- [ ] **Step 3: Write minimal implementation**

Create `src/screens/today/todayModel.ts`:

```ts
/**
 * Everything the Today screen derives, as pure functions.
 *
 * Kept out of the component so it is testable without a component-test
 * harness -- the same reason orderStage.ts exists. Nothing here imports Preact
 * or RxDB.
 */
import { formatMoney } from '../../lib/money'
import type { OrderStage } from '../../db/schema'

/** Stages that still need something doing. Finished work is not "due". */
export const OPEN_STAGES: readonly OrderStage[] = ['measured', 'in_progress', 'ready']

export type HeroTone = 'muted' | 'strong' | 'alert' | 'money'

export interface HeroSegment {
  text: string
  tone: HeroTone
}

export interface HeroCounts {
  late: number
  dueToday: number
  dueThisWeek: number
  outstanding: number
}

/**
 * The hero statement, as tone-tagged segments rather than a string, so the
 * emphasis is data and the component stays dumb.
 */
export function heroSegments(counts: HeroCounts): HeroSegment[] {
  const segments: HeroSegment[] = []

  if (counts.late > 0) {
    segments.push({ text: 'You have ', tone: 'muted' })
    segments.push({ text: `${counts.late} late`, tone: 'alert' })
    if (counts.dueToday > 0) {
      segments.push({ text: ', ', tone: 'muted' })
      segments.push({ text: `${counts.dueToday} due today`, tone: 'strong' })
    }
  } else if (counts.dueToday > 0) {
    segments.push({ text: 'You have ', tone: 'muted' })
    segments.push({ text: `${counts.dueToday} due today`, tone: 'strong' })
  } else if (counts.dueThisWeek > 0) {
    segments.push({ text: 'You have ', tone: 'muted' })
    segments.push({ text: `${counts.dueThisWeek} due this week`, tone: 'strong' })
  } else {
    segments.push({ text: 'Nothing due today', tone: 'strong' })
  }

  if (counts.outstanding > 0) {
    segments.push({ text: ' and ', tone: 'muted' })
    segments.push({ text: `${formatMoney(counts.outstanding)} owed`, tone: 'money' })
  }

  return segments
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/screens/today/todayModel.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/screens/today/todayModel.ts src/screens/today/todayModel.test.ts
git commit -m "feat(today): pure hero statement model"
```

---

### Task 2: Bucketing, including rental returns

This is the highest-risk change in the plan. It closes finding T1: a rental that
is out and overdue for return currently appears on no screen in the app.

**Files:**
- Modify: `src/screens/today/todayModel.ts`
- Test: `src/screens/today/todayModel.test.ts`

**Interfaces:**
- Consumes: `OPEN_STAGES` from Task 1; `dueBucket` from `src/lib/dates.ts`;
  `OrderBalance` from `src/db/balances.ts`; `OrderDoc` from `src/db/schema.ts`.
- Produces: `DueRow`, `TodayBuckets`, `buildBuckets()`.

The rule, stated once so it is not re-derived: a **pickup** row is an order in
`OPEN_STAGES`, bucketed on `pickup_due_date`. A **return** row is an order with
`order_type === 'rental'` **and** `stage === 'picked_up'` **and** a
`return_due_date` present, bucketed on `return_due_date` — and it joins a
bucket **only when overdue**. Every non-overdue return goes to `outOnRental`
instead (decision N9). `later` pickups are dropped entirely.

- [ ] **Step 1: Write the failing test**

Append to `src/screens/today/todayModel.test.ts`:

```ts
import { buildBuckets } from './todayModel'
import type { OrderBalance } from '../../db/balances'
import type { OrderDoc } from '../../db/schema'

const TODAY = '2026-07-31'

function order(overrides: Partial<OrderDoc> & { id: string }): OrderDoc {
  return {
    shop_id: 'shop-1',
    client_id: 'client-1',
    order_type: 'tailor_made',
    item_description: 'Navy suit',
    stage: 'in_progress',
    price_total: 100_000,
    pickup_due_date: TODAY,
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: '2026-07-01T00:00:00.000Z',
    ...overrides,
  }
}

const NAMES = new Map([['client-1', 'Achen Josephine']])
const NO_BALANCES = new Map<string, OrderBalance>()

describe('buildBuckets', () => {
  it('buckets open pickups by due date and drops anything further out', () => {
    const buckets = buildBuckets(
      [
        order({ id: 'late', pickup_due_date: '2026-07-28' }),
        order({ id: 'today', pickup_due_date: TODAY }),
        order({ id: 'week', pickup_due_date: '2026-08-03' }),
        order({ id: 'later', pickup_due_date: '2026-09-01' }),
      ],
      NAMES,
      NO_BALANCES,
      TODAY,
    )

    expect(buckets.overdue.map((row) => row.order.id)).toEqual(['late'])
    expect(buckets.dueToday.map((row) => row.order.id)).toEqual(['today'])
    expect(buckets.dueThisWeek.map((row) => row.order.id)).toEqual(['week'])
    expect(buckets.outOnRental).toEqual([])
  })

  it('excludes finished work from the pickup buckets', () => {
    const buckets = buildBuckets(
      [
        order({ id: 'gone', stage: 'picked_up', pickup_due_date: '2026-07-20' }),
        order({ id: 'back', stage: 'returned', pickup_due_date: '2026-07-20' }),
      ],
      NAMES,
      NO_BALANCES,
      TODAY,
    )
    expect(buckets.overdue).toEqual([])
  })

  // T1: this is the case that appears on no screen today.
  it('puts an overdue rental return in Overdue, marked as a return', () => {
    const buckets = buildBuckets(
      [
        order({
          id: 'tux',
          order_type: 'rental',
          stage: 'picked_up',
          pickup_due_date: '2026-07-10',
          return_due_date: '2026-07-29',
        }),
      ],
      NAMES,
      NO_BALANCES,
      TODAY,
    )

    expect(buckets.overdue).toHaveLength(1)
    expect(buckets.overdue[0]?.kind).toBe('return')
    expect(buckets.overdue[0]?.dueDate).toBe('2026-07-29')
    expect(buckets.outOnRental).toEqual([])
  })

  it('puts a return due today on Out on rental, not in Due today', () => {
    const buckets = buildBuckets(
      [
        order({
          id: 'gown',
          order_type: 'rental',
          stage: 'picked_up',
          return_due_date: TODAY,
        }),
      ],
      NAMES,
      NO_BALANCES,
      TODAY,
    )

    expect(buckets.dueToday).toEqual([])
    expect(buckets.outOnRental.map((row) => row.order.id)).toEqual(['gown'])
  })

  it('puts a future return on Out on rental', () => {
    const buckets = buildBuckets(
      [
        order({
          id: 'gown',
          order_type: 'rental',
          stage: 'picked_up',
          return_due_date: '2026-09-15',
        }),
      ],
      NAMES,
      NO_BALANCES,
      TODAY,
    )
    expect(buckets.outOnRental.map((row) => row.order.id)).toEqual(['gown'])
  })

  it('ignores a picked-up rental with no return date', () => {
    const buckets = buildBuckets(
      [order({ id: 'gown', order_type: 'rental', stage: 'picked_up' })],
      NAMES,
      NO_BALANCES,
      TODAY,
    )
    expect(buckets.outOnRental).toEqual([])
    expect(buckets.overdue).toEqual([])
  })

  // OrderForm rejects this, so it can only arrive by replication from another
  // client. Overdue is the honest reading of a return date already in the past.
  it('buckets a return date earlier than its pickup date as overdue', () => {
    const buckets = buildBuckets(
      [
        order({
          id: 'muddle',
          order_type: 'rental',
          stage: 'picked_up',
          pickup_due_date: '2026-07-25',
          return_due_date: '2026-07-20',
        }),
      ],
      NAMES,
      NO_BALANCES,
      TODAY,
    )
    expect(buckets.overdue.map((row) => row.order.id)).toEqual(['muddle'])
  })

  it('ignores a return date on a non-rental order', () => {
    const buckets = buildBuckets(
      [order({ id: 'suit', stage: 'picked_up', return_due_date: '2026-07-20' })],
      NAMES,
      NO_BALANCES,
      TODAY,
    )
    expect(buckets.overdue).toEqual([])
    expect(buckets.outOnRental).toEqual([])
  })

  it('sorts each bucket by the date it is due on', () => {
    const buckets = buildBuckets(
      [
        order({ id: 'b', pickup_due_date: '2026-07-25' }),
        order({ id: 'a', pickup_due_date: '2026-07-20' }),
      ],
      NAMES,
      NO_BALANCES,
      TODAY,
    )
    expect(buckets.overdue.map((row) => row.order.id)).toEqual(['a', 'b'])
  })

  it('carries the client name and the outstanding balance', () => {
    const balances = new Map<string, OrderBalance>([
      ['today', { order_id: 'today', price_total: 100_000, amount_paid: 40_000, balance: 60_000, fully_paid: false }],
    ])
    const buckets = buildBuckets([order({ id: 'today' })], NAMES, balances, TODAY)

    expect(buckets.dueToday[0]?.clientName).toBe('Achen Josephine')
    expect(buckets.dueToday[0]?.outstanding).toBe(60_000)
  })

  it('falls back for a client that has not synced, rather than hiding the row', () => {
    const buckets = buildBuckets(
      [order({ id: 'today', client_id: 'missing' })],
      NAMES,
      NO_BALANCES,
      TODAY,
    )
    expect(buckets.dueToday[0]?.clientName).toBe('Unknown client')
  })

  it('reports an overpaid order as owing nothing', () => {
    const balances = new Map<string, OrderBalance>([
      ['today', { order_id: 'today', price_total: 100_000, amount_paid: 120_000, balance: -20_000, fully_paid: true }],
    ])
    const buckets = buildBuckets([order({ id: 'today' })], NAMES, balances, TODAY)
    expect(buckets.dueToday[0]?.outstanding).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/screens/today/todayModel.test.ts`
Expected: FAIL — `buildBuckets` is not exported.

- [ ] **Step 3: Write minimal implementation**

Add to `src/screens/today/todayModel.ts`:

```ts
import { dueBucket } from '../../lib/dates'
import type { OrderBalance } from '../../db/balances'
import type { OrderDoc } from '../../db/schema'

export interface DueRow {
  order: OrderDoc
  clientName: string
  /** A garment due out, or a rental due back. Never confuse the two on screen. */
  kind: 'pickup' | 'return'
  /** Whichever date put this row in its bucket. */
  dueDate: string
  /** Clamped at zero so an overpayment never shows as a negative. */
  outstanding: number
}

export interface TodayBuckets {
  overdue: DueRow[]
  dueToday: DueRow[]
  dueThisWeek: DueRow[]
  outOnRental: DueRow[]
}

function toRow(
  order: OrderDoc,
  kind: DueRow['kind'],
  dueDate: string,
  clientNames: ReadonlyMap<string, string>,
  balances: ReadonlyMap<string, OrderBalance>,
): DueRow {
  return {
    order,
    clientName: clientNames.get(order.client_id) ?? 'Unknown client',
    kind,
    dueDate,
    outstanding: Math.max(0, balances.get(order.id)?.balance ?? 0),
  }
}

/** A rental that is out and has a date it is due back on. */
function isOutOnRental(order: OrderDoc): boolean {
  return (
    order.order_type === 'rental' &&
    order.stage === 'picked_up' &&
    typeof order.return_due_date === 'string' &&
    order.return_due_date.length > 0
  )
}

/**
 * Today's four groups. Overdue rental returns join Overdue; every other return
 * goes to outOnRental, so "items that are out" has one home (spec N9).
 */
export function buildBuckets(
  orders: readonly OrderDoc[],
  clientNames: ReadonlyMap<string, string>,
  balances: ReadonlyMap<string, OrderBalance>,
  from: string,
): TodayBuckets {
  const buckets: TodayBuckets = { overdue: [], dueToday: [], dueThisWeek: [], outOnRental: [] }

  for (const order of orders) {
    if (OPEN_STAGES.includes(order.stage)) {
      const row = toRow(order, 'pickup', order.pickup_due_date, clientNames, balances)
      const bucket = dueBucket(order.pickup_due_date, from)
      if (bucket === 'overdue') buckets.overdue.push(row)
      else if (bucket === 'today') buckets.dueToday.push(row)
      else if (bucket === 'this_week') buckets.dueThisWeek.push(row)
      continue
    }

    if (!isOutOnRental(order)) continue

    const returnDate = order.return_due_date as string
    const row = toRow(order, 'return', returnDate, clientNames, balances)
    if (dueBucket(returnDate, from) === 'overdue') buckets.overdue.push(row)
    else buckets.outOnRental.push(row)
  }

  for (const rows of Object.values(buckets)) {
    rows.sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  }

  return buckets
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/screens/today/todayModel.test.ts`
Expected: PASS, 21 tests total.

- [ ] **Step 5: Commit**

```bash
git add src/screens/today/todayModel.ts src/screens/today/todayModel.test.ts
git commit -m "feat(today): bucket rental returns, closing the invisible-return gap

An overdue rental return currently appears on no screen: OPEN_STAGES excludes
picked_up, and dueBucket() was only ever called on pickup_due_date."
```

---

### Task 3: The day strip

**Files:**
- Modify: `src/screens/today/todayModel.ts`
- Test: `src/screens/today/todayModel.test.ts`

**Interfaces:**
- Consumes: `OPEN_STAGES` (Task 1), `isOutOnRental` semantics (Task 2);
  `addDays` from `src/lib/dates.ts`.
- Produces: `DayCell`, `buildDayStrip()`.

- [ ] **Step 1: Write the failing test**

Append to `src/screens/today/todayModel.test.ts`:

```ts
import { buildDayStrip } from './todayModel'

describe('buildDayStrip', () => {
  it('returns seven cells rolling forward from today', () => {
    const cells = buildDayStrip([], TODAY)
    expect(cells).toHaveLength(7)
    expect(cells[0]?.date).toBe('2026-07-31')
    expect(cells[0]?.isToday).toBe(true)
    expect(cells[6]?.date).toBe('2026-08-06')
    expect(cells[6]?.isToday).toBe(false)
  })

  it('labels each cell with its weekday initial and day of month', () => {
    const cells = buildDayStrip([], TODAY)
    // 2026-07-31 is a Friday.
    expect(cells[0]?.weekdayInitial).toBe('F')
    expect(cells[0]?.dayOfMonth).toBe(31)
    expect(cells[1]?.dayOfMonth).toBe(1)
  })

  it('counts open pickups on their due day', () => {
    const cells = buildDayStrip(
      [
        order({ id: 'a', pickup_due_date: TODAY }),
        order({ id: 'b', pickup_due_date: TODAY }),
        order({ id: 'c', pickup_due_date: '2026-08-02' }),
      ],
      TODAY,
    )
    expect(cells[0]?.count).toBe(2)
    expect(cells[2]?.count).toBe(1)
  })

  it('counts rental returns as work on the day they are due back', () => {
    const cells = buildDayStrip(
      [
        order({
          id: 'tux',
          order_type: 'rental',
          stage: 'picked_up',
          pickup_due_date: '2026-07-01',
          return_due_date: '2026-08-02',
        }),
      ],
      TODAY,
    )
    expect(cells[2]?.count).toBe(1)
  })

  it('counts a pickup and a return falling on the same day together', () => {
    const cells = buildDayStrip(
      [
        order({ id: 'a', pickup_due_date: '2026-08-02' }),
        order({
          id: 'tux',
          order_type: 'rental',
          stage: 'picked_up',
          pickup_due_date: '2026-07-01',
          return_due_date: '2026-08-02',
        }),
      ],
      TODAY,
    )
    expect(cells[2]?.count).toBe(2)
  })

  it('ignores work outside the seven-day window', () => {
    const cells = buildDayStrip([order({ id: 'a', pickup_due_date: '2026-09-30' })], TODAY)
    expect(cells.every((cell) => cell.count === 0)).toBe(true)
  })

  it('ignores overdue work, which the buckets already carry', () => {
    const cells = buildDayStrip([order({ id: 'a', pickup_due_date: '2026-07-01' })], TODAY)
    expect(cells.every((cell) => cell.count === 0)).toBe(true)
  })

  // A row of zeroes reads as breakage, so an empty day has no number at all.
  it('renders an empty day as a blank label, not a zero', () => {
    expect(buildDayStrip([], TODAY)[0]?.countLabel).toBe('')
  })

  it('caps the label at 99+ because three digits do not fit the cell', () => {
    const many = Array.from({ length: 120 }, (_, i) =>
      order({ id: `o-${i}`, pickup_due_date: TODAY }),
    )
    const cells = buildDayStrip(many, TODAY)
    expect(cells[0]?.count).toBe(120)
    expect(cells[0]?.countLabel).toBe('99+')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/screens/today/todayModel.test.ts`
Expected: FAIL — `buildDayStrip` is not exported.

- [ ] **Step 3: Write minimal implementation**

Add to `src/screens/today/todayModel.ts` (extend the existing `dates` import to
`import { addDays, dueBucket } from '../../lib/dates'`):

```ts
export interface DayCell {
  /** YYYY-MM-DD. */
  date: string
  weekdayInitial: string
  dayOfMonth: number
  count: number
  /** '' when empty, '99+' above the cap, otherwise the count. */
  countLabel: string
  isToday: boolean
}

const WEEKDAY = new Intl.DateTimeFormat('en-GB', { weekday: 'narrow' })

/** Local Date from a YYYY-MM-DD string, the way dates.ts does it. */
function toLocalDate(isoDate: string): Date {
  const [year, month, day] = isoDate.split('-').map(Number)
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1)
}

function countLabelFor(count: number): string {
  if (count === 0) return ''
  return count > 99 ? '99+' : String(count)
}

/**
 * Seven days from `from`, each carrying the work outstanding on it: open
 * pickups plus rental returns. Informational -- the buckets organise the
 * screen, not this (spec N5, N6).
 */
export function buildDayStrip(orders: readonly OrderDoc[], from: string): DayCell[] {
  const counts = new Map<string, number>()
  const bump = (date: string) => counts.set(date, (counts.get(date) ?? 0) + 1)

  for (const order of orders) {
    if (OPEN_STAGES.includes(order.stage)) bump(order.pickup_due_date)
    else if (isOutOnRental(order)) bump(order.return_due_date as string)
  }

  return Array.from({ length: 7 }, (_, offset) => {
    const date = addDays(from, offset)
    const count = counts.get(date) ?? 0
    return {
      date,
      weekdayInitial: WEEKDAY.format(toLocalDate(date)),
      dayOfMonth: toLocalDate(date).getDate(),
      count,
      countLabel: countLabelFor(count),
      isToday: offset === 0,
    }
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/screens/today/todayModel.test.ts`
Expected: PASS, 30 tests total.

If the weekday-initial assertion fails, the Node ICU build is returning a
different narrow form. Do **not** loosen the test to `expect.any(String)` —
check what `new Intl.DateTimeFormat('en-GB', { weekday: 'narrow' }).format(new
Date(2026, 6, 31))` actually returns and fix the expectation to match, then note
it in the commit message.

- [ ] **Step 5: Commit**

```bash
git add src/screens/today/todayModel.ts src/screens/today/todayModel.test.ts
git commit -m "feat(today): seven-day workload strip model"
```

---

### Task 4: Money summary and row capping

**Files:**
- Modify: `src/screens/today/todayModel.ts`
- Test: `src/screens/today/todayModel.test.ts`

**Interfaces:**
- Consumes: `OPEN_STAGES` (Task 1).
- Produces: `OwingRow`, `MoneySummary`, `buildMoneySummary()`, `CappedRows<T>`,
  `capRows()`.

- [ ] **Step 1: Write the failing test**

Append to `src/screens/today/todayModel.test.ts`:

```ts
import { buildMoneySummary, capRows } from './todayModel'

function balance(id: string, owed: number): [string, OrderBalance] {
  return [
    id,
    { order_id: id, price_total: 100_000, amount_paid: 100_000 - owed, balance: owed, fully_paid: owed <= 0 },
  ]
}

describe('buildMoneySummary', () => {
  it('totals what is outstanding across the shop', () => {
    const summary = buildMoneySummary(
      [order({ id: 'a' }), order({ id: 'b' })],
      NAMES,
      new Map([balance('a', 60_000), balance('b', 40_000)]),
    )
    expect(summary.outstanding).toBe(100_000)
  })

  it('excludes fully paid and overpaid orders from the total', () => {
    const summary = buildMoneySummary(
      [order({ id: 'a' }), order({ id: 'b' }), order({ id: 'c' })],
      NAMES,
      new Map([balance('a', 60_000), balance('b', 0), balance('c', -5_000)]),
    )
    expect(summary.outstanding).toBe(60_000)
    expect(summary.rows.map((row) => row.order.id)).toEqual(['a'])
  })

  it('counts the distinct clients owing, not the orders', () => {
    const summary = buildMoneySummary(
      [
        order({ id: 'a', client_id: 'client-1' }),
        order({ id: 'b', client_id: 'client-1' }),
        order({ id: 'c', client_id: 'client-2' }),
      ],
      NAMES,
      new Map([balance('a', 10_000), balance('b', 10_000), balance('c', 10_000)]),
    )
    expect(summary.clientCount).toBe(2)
  })

  // Money owed on a garment still being made is normal. Money owed on one
  // already collected is what a shop chases, so it sorts first.
  it('puts collected orders first, then sorts by amount owed', () => {
    const summary = buildMoneySummary(
      [
        order({ id: 'making-big', stage: 'in_progress' }),
        order({ id: 'collected-small', stage: 'picked_up' }),
        order({ id: 'collected-big', stage: 'picked_up' }),
      ],
      NAMES,
      new Map([
        balance('making-big', 90_000),
        balance('collected-small', 10_000),
        balance('collected-big', 50_000),
      ]),
    )
    expect(summary.rows.map((row) => row.order.id)).toEqual([
      'collected-big',
      'collected-small',
      'making-big',
    ])
    expect(summary.rows[0]?.collected).toBe(true)
    expect(summary.rows[2]?.collected).toBe(false)
  })

  it('limits the rows it returns', () => {
    const summary = buildMoneySummary(
      [order({ id: 'a' }), order({ id: 'b' }), order({ id: 'c' })],
      NAMES,
      new Map([balance('a', 30_000), balance('b', 20_000), balance('c', 10_000)]),
      2,
    )
    expect(summary.rows).toHaveLength(2)
    expect(summary.outstanding).toBe(60_000)
  })

  it('reports nothing owed on an empty shop', () => {
    const summary = buildMoneySummary([], NAMES, NO_BALANCES)
    expect(summary).toEqual({ outstanding: 0, clientCount: 0, rows: [] })
  })
})

describe('capRows', () => {
  it('returns everything when under the limit', () => {
    expect(capRows([1, 2, 3], 4)).toEqual({ rows: [1, 2, 3], hidden: 0 })
  })

  it('trims to the limit and reports how many are hidden', () => {
    expect(capRows([1, 2, 3, 4, 5, 6], 4)).toEqual({ rows: [1, 2, 3, 4], hidden: 2 })
  })

  it('handles an exact fit', () => {
    expect(capRows([1, 2], 2)).toEqual({ rows: [1, 2], hidden: 0 })
  })

  it('handles an empty list', () => {
    expect(capRows([], 4)).toEqual({ rows: [], hidden: 0 })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/screens/today/todayModel.test.ts`
Expected: FAIL — `buildMoneySummary` is not exported.

- [ ] **Step 3: Write minimal implementation**

Add to `src/screens/today/todayModel.ts`:

```ts
export interface OwingRow {
  order: OrderDoc
  clientName: string
  outstanding: number
  /** Already out of the shop -- these are the ones worth chasing. */
  collected: boolean
}

export interface MoneySummary {
  outstanding: number
  clientCount: number
  rows: OwingRow[]
}

/**
 * What the shop is owed, and by whom. Collected-but-unpaid sorts first because
 * an unpaid garment still on the bench is normal and one already gone is not.
 */
export function buildMoneySummary(
  orders: readonly OrderDoc[],
  clientNames: ReadonlyMap<string, string>,
  balances: ReadonlyMap<string, OrderBalance>,
  limit = 3,
): MoneySummary {
  const owing: OwingRow[] = []
  const clients = new Set<string>()
  let outstanding = 0

  for (const order of orders) {
    const owed = balances.get(order.id)?.balance ?? 0
    if (owed <= 0) continue

    outstanding += owed
    clients.add(order.client_id)
    owing.push({
      order,
      clientName: clientNames.get(order.client_id) ?? 'Unknown client',
      outstanding: owed,
      collected: !OPEN_STAGES.includes(order.stage),
    })
  }

  owing.sort((a, b) => {
    if (a.collected !== b.collected) return a.collected ? -1 : 1
    return b.outstanding - a.outstanding
  })

  return { outstanding, clientCount: clients.size, rows: owing.slice(0, limit) }
}

export interface CappedRows<T> {
  rows: T[]
  hidden: number
}

/** Today shows a few rows per section, never all of them (spec N8). */
export function capRows<T>(rows: readonly T[], limit: number): CappedRows<T> {
  return { rows: rows.slice(0, limit), hidden: Math.max(0, rows.length - limit) }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/screens/today/todayModel.test.ts`
Expected: PASS, 40 tests total.

- [ ] **Step 5: Run the full suite and commit**

Run: `pnpm verify`
Expected: typecheck clean, all tests pass (165 pre-existing + 40 new = 205), build succeeds.
(The README's "94 tests" is stale — it predates the entry-flow work. Verified 165
at this plan's start commit.)

```bash
git add src/screens/today/todayModel.ts src/screens/today/todayModel.test.ts
git commit -m "feat(today): outstanding-money summary and row capping"
```

---

### Task 5: Shared primitives in `ui.tsx`

Presentational, so there is no unit test — `vitest.config.ts` has no Preact
preset (see Global Constraints). The gate is `pnpm verify`.

**Files:**
- Modify: `src/components/ui.tsx`

**Interfaces:**
- Consumes: `ChipTone`, `TAP`, `SURFACE`, `BORDER`, `TEXT_MUTED`, `cn`,
  `IconChevronRight` — all already in the file.
- Produces: `ACCENT_TONES`, `SectionCard`, `AccentRow`, `StatValue`,
  `MoreLink`; `Avatar` gains an optional `size` prop.

- [ ] **Step 1: Add the accent tone map and `SectionCard`**

Add near the existing `CHIP_TONES`:

```tsx
/** Accent-bar fills, keyed by the same tones `Chip` uses, so one stage is one
 *  colour in a chip and on a bar. `Reports`' local BAR_TONES folds into this in S4. */
export const ACCENT_TONES: Record<ChipTone, string> = {
  neutral: 'bg-stone-300 dark:bg-stone-600',
  good: 'bg-emerald-500',
  warn: 'bg-amber-500',
  bad: 'bg-red-500',
  info: 'bg-brand-600',
}
```

Then, in the display section:

```tsx
/**
 * A titled card with an optional count, subtitle and footer link. Names the
 * SectionTitle + Card + RowList composite repeated across four screens.
 */
export function SectionCard({
  title,
  count,
  subtitle,
  footer,
  children,
}: {
  title: string
  count?: number
  subtitle?: string
  footer?: ComponentChildren
  children: ComponentChildren
}) {
  return (
    <section class={`overflow-hidden rounded-card border ${BORDER} ${SURFACE} shadow-card`}>
      <div class="px-4 pt-3.5 pb-2.5">
        <h2 class="flex items-baseline gap-1.5 text-sm font-semibold tracking-tight">
          {title}
          {count !== undefined && (
            <span class={`text-xs font-normal ${TEXT_MUTED}`}>· {count}</span>
          )}
        </h2>
        {subtitle && <p class={`mt-0.5 text-xs ${TEXT_MUTED}`}>{subtitle}</p>}
      </div>
      {children}
      {footer}
    </section>
  )
}
```

- [ ] **Step 2: Add `AccentRow`, `StatValue` and `MoreLink`**

```tsx
/**
 * A tappable row with a leading tone-coloured bar. Its own anchor rather than a
 * ListRow wrapper, because the bar has to sit flush against the card edge.
 */
export function AccentRow({
  href,
  tone = 'neutral',
  trailing,
  children,
}: {
  href: string
  tone?: ChipTone
  trailing?: ComponentChildren
  children: ComponentChildren
}) {
  return (
    <a
      href={href}
      class={`flex items-stretch gap-3 pr-4 transition-colors active:bg-stone-100
              dark:active:bg-stone-800 ${TAP}`}
    >
      <span class={`w-[3px] shrink-0 rounded-r-full ${ACCENT_TONES[tone]}`} aria-hidden="true" />
      <span class="min-w-0 flex-1 py-2.5">{children}</span>
      {trailing && <span class="flex shrink-0 items-center py-2.5">{trailing}</span>}
    </a>
  )
}

/** A large tabular figure. `money` is the only toned variant -- see index.css. */
export function StatValue({
  value,
  tone = 'default',
}: {
  value: string
  tone?: 'default' | 'money'
}) {
  return (
    <p
      class={cn(
        'text-3xl font-semibold leading-none tabular-nums tracking-tight',
        tone === 'money' && 'text-amber-700 dark:text-amber-400',
      )}
    >
      {value}
    </p>
  )
}

/** A card's one labelled way out. Used instead of an overflow menu (spec N10). */
export function MoreLink({ href, children }: { href: string; children: ComponentChildren }) {
  return (
    <a
      href={href}
      class={`flex items-center justify-between gap-2 border-t ${BORDER} px-4 text-sm
              font-medium text-brand-700 transition-colors active:bg-stone-100
              dark:text-brand-300 dark:active:bg-stone-800 ${TAP}`}
    >
      {children}
      <IconChevronRight size={16} class="shrink-0" />
    </a>
  )
}
```

- [ ] **Step 3: Give `Avatar` a size prop**

Replace the existing `Avatar`:

```tsx
/** Circular initials, so a list scans by shape as well as by reading. */
export function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' }) {
  return (
    <span
      class={cn(
        'flex shrink-0 items-center justify-center rounded-full bg-brand-100 font-semibold',
        'text-brand-800 dark:bg-brand-950 dark:text-brand-300',
        size === 'sm' ? 'size-7 text-[11px]' : 'size-10 text-sm',
      )}
      aria-hidden="true"
    >
      {getInitials(name)}
    </span>
  )
}
```

- [ ] **Step 4: Verify**

Run: `pnpm verify`
Expected: typecheck clean, 205 tests pass, build succeeds. `Fab` is still
exported and still used — it is removed in Task 10.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui.tsx
git commit -m "feat(ui): SectionCard, AccentRow, StatValue, MoreLink, sized Avatar"
```

---

### Task 6: `Hero` and `DayStrip` components

**Files:**
- Create: `src/screens/today/Hero.tsx`
- Create: `src/screens/today/DayStrip.tsx`

**Interfaces:**
- Consumes: `HeroSegment`, `HeroTone`, `DayCell` from `todayModel.ts` (Tasks 1, 3).
- Produces: `Hero({ segments, greeting })`, `DayStrip({ cells })`.

- [ ] **Step 1: Write `Hero.tsx`**

```tsx
/**
 * The Today statement. Emphasis comes from the model's tone tags, so this
 * component makes no editorial decisions of its own.
 */
import { cn } from '../../lib/cn'
import type { HeroSegment, HeroTone } from './todayModel'

const TONES: Record<HeroTone, string> = {
  muted: 'text-stone-400 dark:text-stone-500',
  strong: 'font-semibold text-stone-900 dark:text-stone-50',
  alert: 'font-semibold text-red-600 dark:text-red-400',
  money: 'font-semibold text-amber-700 dark:text-amber-400',
}

export function Hero({
  segments,
  greeting,
}: {
  segments: readonly HeroSegment[]
  greeting?: string
}) {
  return (
    <header class="mb-5">
      {greeting && (
        <p class="mb-1.5 text-xs text-stone-500 dark:text-stone-400">{greeting}</p>
      )}
      <p class="text-2xl leading-snug tracking-tight">
        {segments.map((segment, index) => (
          <span key={index} class={cn(TONES[segment.tone])}>
            {segment.text}
          </span>
        ))}
      </p>
    </header>
  )
}
```

- [ ] **Step 2: Write `DayStrip.tsx`**

```tsx
/**
 * Seven days of workload. Informational: a cell links out to the order list
 * for that day rather than filtering this screen (spec N7).
 */
import { cn } from '../../lib/cn'
import type { DayCell } from './todayModel'

export function DayStrip({ cells }: { cells: readonly DayCell[] }) {
  return (
    <nav aria-label="The week ahead" class="mb-5 flex gap-1">
      {cells.map((cell) => (
        <a
          key={cell.date}
          href={`/orders?due=${cell.date}`}
          aria-label={`${cell.count} due on ${cell.date}`}
          class={cn(
            'flex min-h-16 flex-1 flex-col items-center justify-center gap-0.5 rounded-boxed',
            'transition-colors active:bg-stone-200 dark:active:bg-stone-800',
            cell.isToday && 'bg-white shadow-card dark:bg-stone-900',
          )}
        >
          <span class="text-[10px] text-stone-400 dark:text-stone-500">
            {cell.weekdayInitial}
          </span>
          <span
            class={cn(
              'text-sm tabular-nums',
              cell.isToday ? 'font-semibold' : 'text-stone-600 dark:text-stone-300',
            )}
          >
            {cell.dayOfMonth}
          </span>
          {cell.countLabel ? (
            <span
              class="rounded-full bg-brand-100 px-1.5 text-[10px] font-semibold tabular-nums
                     text-brand-800 dark:bg-brand-950 dark:text-brand-300"
            >
              {cell.countLabel}
            </span>
          ) : (
            <span class="text-[10px] text-stone-300 dark:text-stone-700" aria-hidden="true">
              ·
            </span>
          )}
        </a>
      ))}
    </nav>
  )
}
```

- [ ] **Step 3: Verify**

Run: `pnpm verify`
Expected: typecheck clean, 205 tests pass, build succeeds. Both components are
unreferenced so far, which is fine — `Today.tsx` picks them up in Task 7.

- [ ] **Step 4: Commit**

```bash
git add src/screens/today/Hero.tsx src/screens/today/DayStrip.tsx
git commit -m "feat(today): hero statement and day strip components"
```

---

### Task 7: The Today screen

**Files:**
- Create: `src/screens/today/Today.tsx`
- Delete: `src/screens/Dashboard.tsx`
- Modify: `src/screens/Shell.tsx` (import and route only)

**Interfaces:**
- Consumes: everything from Tasks 1–6; `useCurrentShop` from
  `src/state/ShopProvider.tsx`; `useRxQueryStatus` from
  `src/hooks/useRxQuery.ts`; `observeShopBalances` from `src/db/balances.ts`;
  `STAGE_LABELS`, `STAGE_TONES` from `src/screens/orderStage.ts`.
- Produces: `Today` — the component `Shell` routes `/` to.

`useRxQueryStatus` is used rather than `useRxQuery` because "no orders yet" and
"orders not read yet" must render differently; reading an unresolved query as
empty is what the hook's own header warns about.

- [ ] **Step 1: Write `Today.tsx`**

```tsx
/**
 * Today: what needs doing, and what is owed.
 *
 * The in-app replacement for push notifications (ARCHITECTURE.md D5), so every
 * figure is a reactive local query. All derivation lives in todayModel.ts.
 */
import { useMemo } from 'preact/hooks'
import {
  AccentRow,
  Button,
  Card,
  Chip,
  EmptyState,
  MoreLink,
  Screen,
  SectionCard,
  Skeleton,
  StatValue,
} from '../../components/ui'
import { IconOrders, IconPlus } from '../../components/icons'
import { useCurrentShop } from '../../state/ShopProvider'
import { useRxQuery, useRxQueryStatus } from '../../hooks/useRxQuery'
import { observeShopBalances } from '../../db/balances'
import { formatMoney } from '../../lib/money'
import { formatDueDate, today } from '../../lib/dates'
import { STAGE_LABELS, STAGE_TONES } from '../orderStage'
import { Hero } from './Hero'
import { DayStrip } from './DayStrip'
import {
  buildBuckets,
  buildDayStrip,
  buildMoneySummary,
  capRows,
  heroSegments,
  type DueRow,
} from './todayModel'

/** Rows shown per bucket before the "See all" link takes over. */
const ROW_CAP = 4

export function Today() {
  const { db, shop, activeStaff } = useCurrentShop()
  const now = today()

  const { value: orderDocs, loaded } = useRxQueryStatus(
    () => db.orders.find({ selector: { shop_id: shop.id }, sort: [{ pickup_due_date: 'asc' }] }).$,
    [db, shop.id],
    [],
  )
  const clientDocs = useRxQuery(
    () => db.clients.find({ selector: { shop_id: shop.id } }).$,
    [db, shop.id],
    [],
  )
  const balances = useRxQuery(() => observeShopBalances(db, shop.id), [db, shop.id], new Map())

  const orders = useMemo(() => orderDocs.map((doc) => doc.toJSON()), [orderDocs])
  const clientNames = useMemo(
    () => new Map(clientDocs.map((doc) => [doc.id, doc.name])),
    [clientDocs],
  )

  const buckets = useMemo(
    () => buildBuckets(orders, clientNames, balances, now),
    [orders, clientNames, balances, now],
  )
  const cells = useMemo(() => buildDayStrip(orders, now), [orders, now])
  const money = useMemo(
    () => buildMoneySummary(orders, clientNames, balances),
    [orders, clientNames, balances],
  )

  const segments = heroSegments({
    late: buckets.overdue.length,
    dueToday: buckets.dueToday.length,
    dueThisWeek: buckets.dueThisWeek.length,
    outstanding: money.outstanding,
  })

  if (!loaded) {
    return (
      <Screen title="Today">
        <div class="space-y-5">
          <Skeleton class="h-16 w-3/4" />
          <Skeleton class="h-16 w-full" />
          <Skeleton class="h-32 w-full" />
        </div>
      </Screen>
    )
  }

  if (orders.length === 0) {
    return (
      <Screen title="Today">
        <Card padded={false}>
          <EmptyState
            icon={<IconOrders size={26} />}
            title="Nothing on yet"
            description="Once you take an order, what is due and what is owed shows up here."
            action={
              <a href="/orders/new">
                <Button>
                  <IconPlus size={18} /> Take the first order
                </Button>
              </a>
            }
          />
        </Card>
      </Screen>
    )
  }

  return (
    <Screen title="Today">
      <Hero segments={segments} greeting={greeting(activeStaff?.name)} />
      <DayStrip cells={cells} />

      <div class="space-y-4">
        <Bucket title="Overdue" tone="bad" filter="overdue" rows={buckets.overdue} />
        <Bucket title="Due today" tone="warn" filter="today" rows={buckets.dueToday} />
        <Bucket title="Due this week" tone="neutral" filter="week" rows={buckets.dueThisWeek} />

        {buckets.outOnRental.length > 0 && (
          <Bucket
            title="Out on rental"
            tone="info"
            filter="open"
            rows={buckets.outOnRental}
          />
        )}

        {money.outstanding > 0 && (
          <SectionCard
            title="Owed to you"
            subtitle={`across ${money.clientCount} ${money.clientCount === 1 ? 'client' : 'clients'}`}
            footer={<MoreLink href="/reports">See reports</MoreLink>}
          >
            <div class="px-4 pb-3">
              <StatValue value={formatMoney(money.outstanding)} tone="money" />
            </div>
            <ul>
              {money.rows.map((row) => (
                <li key={row.order.id}>
                  <AccentRow
                    href={`/orders/${row.order.id}`}
                    tone="warn"
                    trailing={
                      <span class="text-sm font-semibold text-amber-700 dark:text-amber-400">
                        {formatMoney(row.outstanding)}
                      </span>
                    }
                  >
                    <span class="block truncate font-medium">{row.clientName}</span>
                    <span class="block truncate text-sm text-stone-500 dark:text-stone-400">
                      {row.order.item_description}
                      {row.collected && ' · collected'}
                    </span>
                  </AccentRow>
                </li>
              ))}
            </ul>
          </SectionCard>
        )}
      </div>
    </Screen>
  )
}

function greeting(name: string | undefined, now: Date = new Date()): string {
  const hour = now.getHours()
  const part = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  return name ? `${part}, ${name.split(/\s+/)[0]}` : part
}

function Bucket({
  title,
  tone,
  filter,
  rows,
}: {
  title: string
  tone: 'bad' | 'warn' | 'neutral' | 'info'
  filter: string
  rows: DueRow[]
}) {
  if (rows.length === 0) return null

  const { rows: shown, hidden } = capRows(rows, ROW_CAP)

  return (
    <SectionCard
      title={title}
      count={rows.length}
      footer={
        hidden > 0 ? (
          <MoreLink href={`/orders?filter=${filter}`}>See all {rows.length}</MoreLink>
        ) : undefined
      }
    >
      <ul>
        {shown.map((row) => (
          <li key={`${row.order.id}-${row.kind}`}>
            <AccentRow
              href={`/orders/${row.order.id}`}
              tone={tone}
              trailing={<Chip tone={STAGE_TONES[row.order.stage]}>{STAGE_LABELS[row.order.stage]}</Chip>}
            >
              <span class="block truncate font-medium">
                {row.order.item_description}
                {row.kind === 'return' && (
                  <span class="font-normal text-stone-500 dark:text-stone-400"> · return</span>
                )}
              </span>
              <span class="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-sm text-stone-500 dark:text-stone-400">
                <span class="truncate">{row.clientName}</span>
                <span aria-hidden="true">·</span>
                <span class={tone === 'bad' ? 'text-red-600 dark:text-red-400' : ''}>
                  {formatDueDate(row.dueDate)}
                </span>
                {row.outstanding > 0 && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span class="text-amber-700 dark:text-amber-400">
                      {formatMoney(row.outstanding)} due
                    </span>
                  </>
                )}
              </span>
            </AccentRow>
          </li>
        ))}
      </ul>
    </SectionCard>
  )
}
```

- [ ] **Step 2: Point `Shell` at it and delete `Dashboard`**

In `src/screens/Shell.tsx`, replace `import { Dashboard } from './Dashboard'`
with `import { Today } from './today/Today'`, and change
`<Route path="/" component={Dashboard} />` to
`<Route path="/" component={Today} />`.

```bash
rm src/screens/Dashboard.tsx
```

- [ ] **Step 3: Verify**

Run: `pnpm verify`
Expected: typecheck clean, 205 tests pass, build succeeds. A `tsc` error naming
`Dashboard` means a second import was missed — `grep -rn "Dashboard" src/` finds it.

- [ ] **Step 4: Check it in a browser**

Run: `pnpm dev`, open at 390×844, seed with "Seed sample shop data" (every seeded
PIN is `1234`). Confirm: the hero reads as a sentence, the strip shows counts
under the right days, buckets appear in urgency order, and the money card shows a
figure. Toggle the OS to dark mode and confirm every new surface follows.

- [ ] **Step 5: Commit**

```bash
git add -A src/screens/today src/screens/Shell.tsx
git rm --cached src/screens/Dashboard.tsx 2>/dev/null || true
git add -u
git commit -m "feat(today): rebuild Today on the pure model

Replaces Dashboard.tsx. Rental returns now surface: an overdue return joins
Overdue, the rest get their own card."
```

---

### Task 8: Tab bar — four labels and a raised centre action

**Files:**
- Modify: `src/components/TabBar.tsx`

**Interfaces:**
- Consumes: `IconHome`, `IconUsers`, `IconOrders`, `IconMoney`, `IconPlus` from
  `src/components/icons.tsx`. There is no chart icon; `IconMoney` is what
  `Settings.tsx` already uses for the Reports row, so Reports keeps it.
- Produces: nothing other tasks consume.

- [ ] **Step 1: Rewrite the component**

Replace the whole file:

```tsx
import { useLocation } from 'preact-iso'
import { IconHome, IconMoney, IconOrders, IconPlus, IconUsers } from './icons'

/**
 * Bottom navigation: four labelled destinations, split two-and-two, with the
 * create action raised over the centre seam.
 *
 * Bottom rather than top because the top of a modern handset is out of thumb
 * reach one-handed. Four labels is the ceiling -- past that they shrink below
 * legibility on a narrow screen. Settings therefore lives in the status strip
 * rather than here, and the centre button is an action, not a fifth label.
 */
const TABS = [
  { href: '/', label: 'Today', Icon: IconHome },
  { href: '/clients', label: 'Clients', Icon: IconUsers },
  { href: '/orders', label: 'Orders', Icon: IconOrders },
  { href: '/reports', label: 'Reports', Icon: IconMoney },
] as const

function isActive(currentPath: string, href: string): boolean {
  if (href === '/') return currentPath === '/'
  return currentPath === href || currentPath.startsWith(`${href}/`)
}

export function TabBar() {
  const { path } = useLocation()

  return (
    <nav
      class="fixed inset-x-0 bottom-0 z-30 border-t border-stone-200/80 bg-white/85
             backdrop-blur-lg safe-bottom dark:border-stone-800 dark:bg-stone-900/85
             supports-backdrop-filter:bg-white/70
             dark:supports-backdrop-filter:bg-stone-900/70"
      aria-label="Main"
    >
      <div class="relative mx-auto flex max-w-lg">
        {TABS.slice(0, 2).map((tab) => (
          <Tab key={tab.href} {...tab} active={isActive(path, tab.href)} />
        ))}

        {/* Reserves the centre for the raised button, which is positioned
            rather than laid out so it can overhang the bar's top edge. */}
        <span class="w-16 shrink-0" aria-hidden="true" />

        {TABS.slice(2).map((tab) => (
          <Tab key={tab.href} {...tab} active={isActive(path, tab.href)} />
        ))}

        <a
          href="/orders/new"
          aria-label="Take an order"
          class="absolute left-1/2 top-0 flex size-14 -translate-x-1/2 -translate-y-4
                 items-center justify-center rounded-full bg-brand-700 text-white
                 shadow-raised transition-transform active:scale-95 dark:bg-brand-600"
        >
          <IconPlus size={26} />
        </a>
      </div>
    </nav>
  )
}

function Tab({
  href,
  label,
  Icon,
  active,
}: {
  href: string
  label: string
  Icon: (props: { size?: number; 'stroke-width'?: number }) => preact.JSX.Element
  active: boolean
}) {
  return (
    <a
      href={href}
      aria-current={active ? 'page' : undefined}
      class={`flex min-h-14 flex-1 flex-col items-center justify-center gap-1 transition-colors ${
        active ? 'text-brand-800 dark:text-brand-300' : 'text-stone-500 dark:text-stone-400'
      }`}
    >
      <span
        class={`flex h-7 w-11 items-center justify-center rounded-full transition-colors ${
          active ? 'bg-brand-100 dark:bg-brand-950' : 'bg-transparent'
        }`}
      >
        <Icon size={22} stroke-width={active ? 2.1 : 1.75} />
      </span>
      <span class={`text-[11px] ${active ? 'font-semibold' : ''}`}>{label}</span>
    </a>
  )
}
```

If `preact.JSX.Element` does not resolve, add `import type { JSX } from 'preact'`
at the top and use `JSX.Element`.

- [ ] **Step 2: Verify**

Run: `pnpm verify`
Expected: typecheck clean, 205 tests pass, build succeeds.

- [ ] **Step 3: Check it in a browser**

Run: `pnpm dev` at 390×844. Confirm: four labels are legible, the `+` is
centred and overhangs the top edge, tapping it reaches `/orders/new`, and the
Reports tab highlights on `/reports`. On `/settings` no tab is highlighted —
that is correct, it is no longer a tab.

- [ ] **Step 4: Commit**

```bash
git add src/components/TabBar.tsx
git commit -m "feat(nav): four labelled tabs with a raised centre create action

Settings leaves the bar for the status strip; Reports takes the slot."
```

---

### Task 9: Settings moves to the status strip

**Files:**
- Modify: `src/screens/Shell.tsx:48-58`
- Modify: `src/screens/Settings.tsx:73-87`

**Interfaces:**
- Consumes: `Avatar` with the `size` prop from Task 5; `IconSettings` from
  `src/components/icons.tsx`.
- Produces: nothing other tasks consume.

- [ ] **Step 1: Replace the strip's right-hand side in `Shell.tsx`**

Add `import { Avatar } from '../components/ui'` and
`import { IconSettings } from '../components/icons'`, then replace the
`{activeStaff && (...)}` block with:

```tsx
          {/* One control, not two: the avatar says who is working, the gear says
              what tapping does, and both go to the same place. */}
          <a
            href="/settings"
            aria-label="Settings"
            class="-mr-1 flex items-center gap-1.5 rounded-full py-0.5 pl-0.5 pr-2
                   text-stone-500 transition-colors active:bg-stone-100
                   dark:text-stone-400 dark:active:bg-stone-800"
          >
            {activeStaff && <Avatar name={activeStaff.name} size="sm" />}
            <IconSettings size={16} />
          </a>
```

The "staff name · shop name" text is deliberately dropped — the avatar's
initials carry who is active and Today's greeting carries the name.

- [ ] **Step 2: Remove the Reports row from `Settings.tsx`**

Delete the entire `<li>` containing the `/reports` `ListRow` (the block starting
`<li>` immediately after the `SECTIONS.map(...)` closing `)}`), then remove
`IconMoney` from the icons import, since nothing else in the file uses it.

- [ ] **Step 3: Verify**

Run: `pnpm verify`
Expected: typecheck clean, 205 tests pass, build succeeds. An unused-import
error on `IconMoney` means Step 2's second half was missed.

- [ ] **Step 4: Check it in a browser**

Run: `pnpm dev` at 390×844. Confirm: the strip shows the sync badge on the left
and the avatar-plus-gear on the right, tapping it reaches `/settings`, the strip
has not grown taller, and Settings no longer lists Reports.

- [ ] **Step 5: Commit**

```bash
git add src/screens/Shell.tsx src/screens/Settings.tsx
git commit -m "feat(nav): Settings moves to the status strip, reachable everywhere

Reports is a tab now, so its Settings row goes."
```

---

### Task 10: Order-list parameters, and `Fab` is deleted

**Files:**
- Modify: `src/screens/Orders.tsx`
- Modify: `src/screens/Clients.tsx`
- Modify: `src/components/ui.tsx` (delete `Fab`)

**Interfaces:**
- Consumes: `useLocation` from `preact-iso` (already used in `OrderForm.tsx`);
  `Button`, `Sheet` from `ui.tsx`.
- Produces: `/orders?filter=overdue|today|week|open|ready|owing|all` and
  `/orders?due=YYYY-MM-DD`, which Task 7's `MoreLink` and `DayStrip` hrefs
  target.

`today` and `week` are incoming filter values not offered in the `Segmented`
control — seven segments would be too narrow to hit. When one of those, or
`due`, is active, a dismissible line names it instead.

- [ ] **Step 1: Read the parameters in `Orders.tsx`**

Add `import { useLocation } from 'preact-iso'` and widen the filter type:

```tsx
type Filter = 'open' | 'ready' | 'overdue' | 'owing' | 'all' | 'today' | 'week' | 'out'

/** Values the segmented control offers. `today`, `week` and `out` arrive by link only. */
const FILTERS: readonly { value: Filter; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'ready', label: 'Ready' },
  { value: 'owing', label: 'Owing' },
  { value: 'all', label: 'All' },
]

const SEGMENTED_VALUES: readonly Filter[] = ['open', 'overdue', 'ready', 'owing', 'all']

function isFilter(value: string | null): value is Filter {
  return (
    value !== null &&
    ['open', 'ready', 'overdue', 'owing', 'all', 'today', 'week', 'out'].includes(value)
  )
}

/** A rental that is out and has a date it is due back on. Mirrors todayModel's rule. */
function isOutOnRental(order: OrderDoc): boolean {
  return (
    order.order_type === 'rental' &&
    order.stage === 'picked_up' &&
    typeof order.return_due_date === 'string' &&
    order.return_due_date.length > 0
  )
}
```

`OrderDoc` is already imported by this file. **`overdue` must count overdue rental
returns as well as overdue pickups**, and **`out` is a new value** — without both,
Today's "See all" links land on lists that do not contain the rows they came from.
That mismatch is the reason this task grew; see the ledger entry under Task 7.

Inside the component, replace `const [filter, setFilter] = useState<Filter>('open')`
with:

```tsx
  const location = useLocation()
  const query = new URLSearchParams(location.query as Record<string, string>)
  const param = query.get('filter')
  const due = query.get('due')

  const [override, setOverride] = useState<Filter | null>(null)
  // A link's filter wins until the user touches the control, which clears it.
  const filter: Filter = override ?? (isFilter(param) ? param : 'open')
  const setFilter = (next: Filter) => setOverride(next)
  const linked = override === null && (isFilter(param) || due !== null)
```

Extend the `orders` memo's switch with the two new cases and the `due` filter,
and add `due` and `override` to its dependency array:

```tsx
  const orders = useMemo(() => {
    const all = orderDocs.map((doc) => doc.toJSON())
    // A day link is a filter of its own, not one of the segments.
    if (override === null && due) {
      return all.filter(
        (o) =>
          (OPEN_STAGES.includes(o.stage) && o.pickup_due_date === due) ||
          (o.order_type === 'rental' && o.stage === 'picked_up' && o.return_due_date === due),
      )
    }
    switch (filter) {
      case 'all':
        return all
      case 'open':
        return all.filter((o) => OPEN_STAGES.includes(o.stage))
      case 'ready':
        return all.filter((o) => o.stage === 'ready')
      // Overdue means both kinds of lateness: a garment not yet handed over,
      // and a rental not yet brought back. Today's Overdue bucket holds both.
      case 'overdue':
        return all.filter(
          (o) =>
            (OPEN_STAGES.includes(o.stage) && dueBucket(o.pickup_due_date) === 'overdue') ||
            (isOutOnRental(o) && dueBucket(o.return_due_date as string) === 'overdue'),
        )
      case 'out':
        return all.filter(isOutOnRental)
      case 'today':
        return all.filter(
          (o) => OPEN_STAGES.includes(o.stage) && dueBucket(o.pickup_due_date) === 'today',
        )
      case 'week':
        return all.filter(
          (o) => OPEN_STAGES.includes(o.stage) && dueBucket(o.pickup_due_date) === 'this_week',
        )
      case 'owing':
        return all.filter((o) => (balances.get(o.id)?.balance ?? 0) > 0)
    }
  }, [orderDocs, filter, balances, due, override])
```

Then, above the `Segmented` control, render the linked-filter line and pass the
control a value it can represent:

```tsx
          {linked ? (
            <p class="flex items-center justify-between gap-3 px-1 text-sm text-stone-600 dark:text-stone-300">
              <span class="truncate">
                Showing {due ? formatDate(due) : LINKED_LABELS[filter]}
              </span>
              <button
                type="button"
                onClick={() => setOverride('open')}
                class="shrink-0 font-medium text-brand-700 dark:text-brand-300"
              >
                Clear
              </button>
            </p>
          ) : (
            <Segmented
              value={SEGMENTED_VALUES.includes(filter) ? filter : 'open'}
              options={FILTERS}
              onChange={setFilter}
              label="Filter orders"
            />
          )}
```

Add the label map beside `FILTERS`, and import `formatDate` alongside the
existing `dueBucket`/`formatDueDate` import from `../lib/dates`:

```tsx
const LINKED_LABELS: Record<Filter, string> = {
  open: 'open orders',
  ready: 'orders ready',
  overdue: 'overdue orders',
  owing: 'orders owing',
  all: 'all orders',
  today: 'orders due today',
  week: 'orders due this week',
  out: 'rentals out',
}
```

Extend `emptyTitle` and `emptyDescription` with the three new cases:

```tsx
  if (filter === 'today') return 'Nothing due today'
  if (filter === 'week') return 'Nothing due this week'
  if (filter === 'out') return 'Nothing out on rental'
```
```tsx
  if (filter === 'today') return 'No open order has today as its due date.'
  if (filter === 'week') return 'No open order falls in the next seven days.'
  if (filter === 'out') return 'No rental is currently with a client.'
```

- [ ] **Step 2: Remove `Fab` from `Orders.tsx`**

Delete the `<Fab href="/orders/new" label="New order" icon={<IconPlus size={24} />} />`
element. That leaves the `<>...</>` fragment wrapping a single `<Screen>`, so
unwrap it and return the `<Screen>` directly. Remove **both** `Fab` and
`IconPlus` from the `ui`/`icons` imports — `IconPlus` was used only by the
`Fab`, and `strict` will fail the build on the unused import. Keep `IconOrders`,
which `EmptyState` still uses. The centre tab from Task 8 is the create action
now.

- [ ] **Step 3: Give `Clients.tsx` a header action instead of a `Fab`**

Delete the `{clients.length > 0 && (<Fab ... />)}` block and give `Screen` an
action, so adding a client is still possible once the empty state is gone:

```tsx
      <Screen
        title="Clients"
        subtitle={clients.length > 0 ? `${clients.length} in total` : undefined}
        action={
          <Button size="sm" onClick={() => setAdding(true)}>
            <IconPlus size={16} /> Add
          </Button>
        }
      >
```

Remove `Fab` from the imports; keep `IconPlus`.

- [ ] **Step 4: Delete `Fab` from `ui.tsx`**

Remove the whole `Fab` function and its doc comment. Nothing should reference it
now.

- [ ] **Step 5: Verify**

Run: `pnpm verify`
Expected: typecheck clean, 205 tests pass, build succeeds. A `tsc` error naming
`Fab` means a call site was missed — `grep -rn "Fab" src/` finds it.

- [ ] **Step 6: Check it in a browser**

Run: `pnpm dev` at 390×844, seeded. Confirm:
- A day cell on Today opens `/orders?due=...` and lists that day's work, with
  the "Showing 3 Aug 2026 · Clear" line in place of the segments.
- "Clear" restores the segmented control on Open.
- A bucket's "See all" link filters correctly for `overdue`, `today` and `week`.
- Clients' header "Add" opens the new-client sheet.
- No floating button remains anywhere.

- [ ] **Step 7: Commit**

```bash
git add src/screens/Orders.tsx src/screens/Clients.tsx src/components/ui.tsx
git commit -m "feat(orders): accept filter and due parameters; drop Fab

Today's day strip and See-all links target these. Clients' create action moves
into its header, since the centre tab routes to /orders/new."
```

---

## Final verification

- [ ] Run `pnpm verify` — typecheck clean, 205 tests pass, production build succeeds.
- [ ] Run `grep -rn "Dashboard\|Fab" src/` — no results.
- [ ] Walk the app at 390×844 in both light and dark mode: Today → a bucket row →
  an order → back; Today → a day cell → Orders → Clear; every tab; the status
  strip's Settings control from three different screens.
- [ ] Confirm the rental fix against seeded data by setting a rental order to
  `picked_up` with a past `return_due_date`, then checking it appears in
  Overdue, marked as a return.
- [ ] Update `docs/ARCHITECTURE.md` §11 and `docs/IMPLEMENTATION_PLAN.md` if
  either states something this plan has changed.

## Known limitations of this plan

- **The raised centre button cannot be desk-verified.** It overhangs the bar and
  sits above `env(safe-area-inset-bottom)`. Whether it clears the home indicator,
  and whether its overhang creates a dead zone on the flanking tabs, needs a real
  handset (`X2`).
- **No component tests.** `vitest.config.ts` has `environment: 'node'` and no
  Preact preset, so Tasks 5–10 gate on `pnpm verify` and a manual browser pass.
  Adding a harness is out of scope and belongs with `X8`. Two items the spec's
  Testing section lists are component-level and therefore fall into this gap
  rather than being covered: **the empty-shop branch** and **the four-row cap as
  rendered** (`capRows` itself is tested; `ROW_CAP`'s wiring in `Today.tsx` is
  not). The greeting's no-active-staff fallback is likewise unverified.
- **`OPEN_STAGES` ends up defined twice** — in `todayModel.ts` and, as before, in
  `Orders.tsx:39`. Pre-existing duplication that this plan neither fixes nor
  worsens; the natural time to collapse it is S2, which rewrites `Orders`.
- **`Reports` keeps its own `BAR_TONES`** duplicating `ACCENT_TONES`. Collapsing
  them is S4's job, not this plan's.
