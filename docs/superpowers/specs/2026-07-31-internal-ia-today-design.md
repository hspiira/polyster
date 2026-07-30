# Internal navigation and the Today screen — design

Date: 2026-07-31
Status: approved, not implemented
Scope: the authenticated shell's navigation, and the Today screen. **S1 of four.**

## Where this sits

The entry flow — everything before the shell — was redesigned in
[`2026-07-30-entry-flow-redesign-design.md`](2026-07-30-entry-flow-redesign-design.md).
This document starts the equivalent work inland, and is the first of four
specs. A single spec covering eight screens would be too large to review or
implement in one pass.

| Spec | Scope | Depends on |
|---|---|---|
| **S1 (this)** | Tab bar, Settings' placement, Reports' placement, Today, shared primitives | — |
| S2 | `Orders`, `OrderDetail`, `OrderForm` | S1 |
| S3 | `Clients`, `ClientDetail`, measurements | S1 |
| S4 | `Settings` and its four sub-screens, `Reports` | S1 |

S2, S3 and S4 are independent of each other. All three consume the primitives
S1 introduces, which is why S1 is first: designing Today forces those
primitives into existence against a real screen rather than inventing them in
the abstract.

## Two constraints inherited, not chosen

**The visual system stays themed.** The entry flow is a fixed dark world
(decision E6) so that a first run does not flicker between light and dark. That
dark world stops at the Shell. This design takes the reference material's
*hierarchy* — a two-weight hero statement, section cards with a count subtitle,
tone-coloured accent bars, large tabular figures — and applies it inside the
existing `prefers-color-scheme` system. It does not extend the glass. Two
reasons, both already recorded in the codebase: E6, and the note repeated in
`ui.tsx` and `index.css` that this app is used standing outside in direct sun,
where a dark surface is the harder one to read.

**Nothing here has run on a phone.** `ARCHITECTURE.md` §11 and task `X2` are
explicit. Every layout decision below is a desk decision made at 390×844 in a
desktop browser, and should be held loosely until someone has taken a real
order on real hardware.

## Review findings

Recorded first so the rest of the document reads as a response to something
specific.

| # | Finding | File |
|---|---|---|
| T1 | **Rental returns are bucketed nowhere.** `OPEN_STAGES` excludes `picked_up`, and `dueBucket()` is only ever called on `pickup_due_date`. A rental that is out and overdue for return appears on no screen in the app. | `src/screens/Dashboard.tsx:32,57-59`, `src/screens/Orders.tsx:39,144-145` |
| T2 | Every bucket renders every row, uncapped. Twenty overdue orders makes Today a wall of rows with no summary. | `src/screens/Dashboard.tsx:281` |
| T3 | Reports lives behind Settings, and *also* has a button on Today. Two doors, and the primary one is in the wrong place — "what did I collect this week" is not a setting. | `src/screens/Settings.tsx:74`, `src/screens/Dashboard.tsx:197` |
| T4 | The primary action — take an order — is absent from Today and from Reports. `Fab` is mounted on `Orders` and `Clients` only. | `src/screens/Orders.tsx:112`, `src/screens/Clients.tsx:114` |
| T5 | Settings occupies a quarter of the tab bar, for the least-used destination in the app. | `src/components/TabBar.tsx:15-20` |
| T6 | Today stacks seven sections with no hierarchy between them: two stat cards, a chip row, three due-buckets, an owing list, a note, and a button. | `src/screens/Dashboard.tsx:110-201` |
| T7 | `Dashboard` defines a local `Stat` component that no other screen can reach, while `Reports` renders comparable figures by hand. | `src/screens/Dashboard.tsx:214` |
| T8 | `SectionTitle` followed by `Card padded={false}` followed by `RowList` is repeated at every section on four screens. It is the app's most common composite and has no name. | `Dashboard`, `Reports`, `Settings`, `ClientDetail` |
| T9 | An emerald note exists solely to announce that three other sections are empty. | `src/screens/Dashboard.tsx:184-195` |
| T10 | The stage-chip row duplicates Reports' stage breakdown, without Reports' context for reading it. | `src/screens/Dashboard.tsx:126-133` |

T1 is a behaviour gap in the core loop of a product called a rental tracker,
not a presentation issue. It is fixed here rather than deferred to S2 because
Today is the screen whose entire job is "what needs doing", and an item that
should be back in the shop and is not needs doing.

## Decisions

| # | Decision | Rejected | Why |
|---|---|---|---|
| N1 | Four labelled tabs, split two-and-two, with a raised create action centred over the seam | Five labelled slots; four slots with the action third-of-four | Four labels is the legibility ceiling `TabBar.tsx` already documents at 390px. A raised circle over the seam is a fifth target without a fifth label, and lands the action dead centre. |
| N2 | Settings moves to a gear beside the avatar in the Shell's status strip | Keeping the tab; a hamburger; an avatar-only affordance | The strip already exists and already carries `SyncBadge`, so Settings becomes reachable from *every* screen rather than one. Closes T5 without hiding it behind an unlabelled icon alone — the gear is explicit. |
| N3 | Reports takes the vacated tab. The Settings entry is removed. Today's money card keeps a contextual link into it. | Folding Reports into Today as cards; leaving the fourth slot empty | Closes T3. A tab and a contextual drill-down are not duplicate doors; a Settings row and a Today button were. Folding it in would put a seven-day series and five stage bars onto a screen whose job is the next seven days. |
| N4 | The back chevron stays for in-app navigation | Extending the entry flow's swipe-only rule inland | Resolves the entry spec's open item. A linear wizard makes swipe discoverable; a browsing tree reached from lists and deep links does not. `X2` records that the Android back button is unverified on real hardware, and removing the only visible way back on untested hardware is not a trade worth making for consistency. |
| N5 | Urgency buckets remain Today's spine | A day-selector as the organiser | Buckets encode lateness; a calendar cannot. Under a day-first layout an overdue order hides behind an unselected day, which is the one thing this screen must never do. |
| N6 | A rolling seven-day strip sits above the buckets, informational, counting work per day | No strip; a Mon–Sun calendar week | Gives the week-ahead workload glance the buckets cannot, without becoming a mode. Rolling from today rather than from Monday, so no cell is a dead past day. |
| N7 | Strip cells count pickups due **and** rental returns due. Tapping routes to `/orders?due=YYYY-MM-DD`. | Counting pickups only; tapping filtering Today in place | Counting pickups only under-reports a rental shop's day. Routing out rather than filtering in place keeps Today single-mode (N5). |
| N8 | Every bucket caps at four rows, then a labelled "See all *n*" link | Uncapped; a fixed "+n more" with no link | Closes T2. The cap needs a way out, and an unlabelled count is not one. |
| N9 | Rental returns are bucketed. Overdue returns join **Overdue**, marked as returns; the rest get an **Out on rental** card. | Deferring to S2; a separate Rentals tab | Closes T1. Overdue is already the screen's alarm; a second alarm elsewhere splits attention. |
| N10 | No overflow (`···`) menus | Copying the reference material's per-card menus | There are no per-card settings in this app. A menu with nothing in it is worse than no menu. Cards get one explicit labelled link. |
| N11 | All derivation moves to a pure `src/screens/todayModel.ts`, tested | Keeping it in the component | Matches the `orderStage.ts` + `orderStage.test.ts` pattern already in `src/screens/`. `X8` names Today's bucketing as one of the two things most worth pinning down. |
| N12 | `Fab` is removed from the codebase | Keeping it alongside the centre tab | Two floating create actions is a menu. The centre tab supersedes it on both screens that mount it. |
| N13 | Amber stays reserved for money outstanding | Using amber for the "due today" bucket fill | The rule is stated in `index.css` and is what makes the outstanding figure unmissable. Due-today gets amber only on its accent bar and count, never on a figure. |

## Navigation

```
┌──────────────────────────────────────────┐
│  ◉ synced                     ⚙︎   ◐ NK  │  status strip (Shell, all screens)
├──────────────────────────────────────────┤
│                                          │
│                  screen                  │
│                                          │
├──────────────────────────────────────────┤
│                   ╭───╮                  │
│   ⌂        ☷      │ ＋ │      ▤      ▥   │  raised, brand-filled
│ Today   Clients   ╰───╯   Orders  Reports│
└──────────────────────────────────────────┘
```

- The status strip gains, on the right, a gear linking to `/settings` and the
  existing `Avatar` for the active staff member. `SyncBadge` keeps the left.
  The avatar is decorative and also links to `/settings` — it is not a second
  destination.
- The centre button links to `/orders/new`. It is a brand-filled circle raised
  above the bar's top edge, clearing the home indicator via the existing
  `safe-bottom` handling.
- `isActive()` in `TabBar.tsx` needs no change beyond the new `TABS` entries.
  `/settings/*` no longer matches any tab, which is correct — it is no longer a
  tab.

## Today, composed

```
 Good morning, Nakato                    muted, staff first name

 You have 2 late, 3 due today            hero: muted connectives,
 and USh 240,000 owed                    strong figures, red and amber

 M    T    W    T    F    S    S         rolling 7 days from today
 31   1    2    3    4    5    6
 ⑤    ②    ·    ③    ①    ·    ·         work per day, tappable
 ▔▔                                      today marked

┌ Overdue · 2 ──────────────────────────┐
│ ┃ Wedding gown        Ready  80,000 due│  red accent
│ ┃ Rental tux · return  Out    2d late  │  T1's case, now visible
└───────────────────────────────────────┘
┌ Due today · 3 ────────────────────────┐
│ ┃ Kitenge dress        Ready          │  amber accent
│ ┃ Navy two-piece      Sewing  40,000  │
│ ┃ Gomesi            Measured          │
└───────────────────────────────────────┘
┌ Due this week · 5 ────────────────────┐
│ ┃ Grey suit          Sewing  in 3 days│  neutral accent
│ ┃ … three more                        │
│ See all 5 ───────────────────────────›│  cap at four rows
└───────────────────────────────────────┘
┌ Out on rental · 2 ────────────────────┐
│ ┃ Black gown      back in 2 days      │
└───────────────────────────────────────┘
┌ Owed to you ──────────────────────────┐
│ USh 240,000                            │  large, tabular, amber
│ across 4 clients                       │
│ ┃ Achen Josephine    80,000  collected │
│ ┃ Okello Peter       60,000  collected │
│ See reports ─────────────────────────›│
└───────────────────────────────────────┘
```

### The hero

A pure function returning tone-tagged segments, not a string template, so the
emphasis is data rather than markup:

```
type HeroTone = 'muted' | 'strong' | 'alert' | 'money'
heroSegments(counts) -> { text: string; tone: HeroTone }[]
```

Two clauses. The work clause joins its own two parts with a muted comma; the
money clause attaches with a muted "and", so no sentence carries two "and"s:

- **Work clause.** Late *and* due-today when both are non-zero
  ("2 late, 3 due today"); otherwise the most urgent non-empty bucket;
  otherwise "Nothing due today". Late renders `alert`, the rest `strong`.
- **Money clause.** Present only when total outstanding is above zero. Renders
  `money`.

When both clauses are absent the hero is a single `strong` "Nothing due today",
which is what replaces T9's note.

### The day strip

Seven cells beginning with today. Each cell carries a weekday initial, the day
of the month, and a count. Today's cell is marked with a rule beneath it; there
is no selection state, because tapping navigates away rather than filtering in
place.

A cell's count is the number of open orders whose `pickup_due_date` is that day,
plus the number of rentals at `picked_up` whose `return_due_date` is that day.
A zero count renders as a dot, not a `0` — a row of zeroes reads as breakage.

### Buckets

Three, in order, each hidden when empty: **Overdue** (red), **Due today**
(amber), **Due this week** (neutral). Membership is `dueBucket()` over
`pickup_due_date` for orders in `measured | in_progress | ready`, unchanged
from today, **plus** rentals at `picked_up` whose `return_due_date` falls in the
same bucket (N9). A return-derived row is labelled as a return and shows its
`return_due_date`, so the two kinds are never confused.

Rows show the item description, the client name, the stage as a `Chip`, and the
outstanding balance when above zero. Four rows, then `See all n ›` into
`/orders?filter=overdue`, `?filter=today` or `?filter=week` respectively —
one parameter with three values, distinct from the strip's `?due=YYYY-MM-DD`.
`Orders` today has an `open | overdue | ready | owing | all` filter in local
state; `today` and `week` are new values it must accept, and reading the
parameter at all is new.

### Out on rental

Rentals at `picked_up` with a `return_due_date` that is **not** overdue — those
are already in Overdue. Hidden when empty, which is every non-rental shop.

### Owed to you

Replaces both stat cards, the chip row, the "collected, still owing" section
and the Reports button. The total outstanding as a large tabular figure, the
count of clients it spans, then up to three rows — collected-but-owing first,
since those are the ones a shop chases — and `See reports ›`.

### Empty shop

Unchanged in intent from `Dashboard.tsx:87-106`: when the shop has no orders at
all, the whole composition is replaced by a single `EmptyState` whose action
links to `/orders/new`. The hero and strip are suppressed; a hero reading
"Nothing due today" above seven empty day cells is a worse first impression
than one clear invitation.

## Primitives

New in `src/components/ui.tsx`, all themed:

| Primitive | Purpose |
|---|---|
| `Hero` | Renders `heroSegments()` output. Two weights, four tones. |
| `SectionCard` | Title, count subtitle, body, optional footer link. Names the composite in T8 and replaces it at every call site on Today. |
| `AccentRow` | `ListRow` with a leading tone-coloured bar. |
| `StatValue` | Large tabular figure with an optional tone. Promotes T7's local `Stat`. |
| `DayStrip` | The seven-cell workload strip. |
| `MoreLink` | The `See all n ›` footer row, used inside `SectionCard`. |

Accent-bar and figure tones reuse `STAGE_TONES`, so a stage is the same colour
in a chip, on a bar, and in `Reports`' `BAR_TONES` — the rule that file already
sets in its header.

`SectionTitle` is **not** removed: `Reports`, `Settings` and `ClientDetail`
still use it, and those are S2–S4's business. It becomes deprecated in
favour of `SectionCard`, to be retired when the last call site goes.

## Data flow

No new queries and no schema change. Today keeps the three subscriptions it has
— `orders` by `shop_id` sorted by `pickup_due_date`, `clients` by `shop_id`,
and `observeShopBalances()` — and passes their output to `todayModel.ts`.
`return_due_date` is already in `orderSchema` and already replicated; nothing
in T1's fix needs a migration.

Balances continue to come from `observeShopBalances()`, never the
`order_balances` view (D9).

## Error handling

Unchanged from the current screen, which is to say there is little to handle:
every figure is a local reactive query, so there are no request failures to
surface. Two states worth stating:

- **Before the first emission**, `useRxQuery`'s initial value is an empty array
  and the screen renders the empty shop state. That is a wrong-then-right flash
  on a slow open. `Skeleton` already exists for exactly this and is currently
  unused on Today; the hero, strip and one card get skeletons until the first
  `orders` emission resolves.
- **A missing client** on an order keeps today's `'Unknown client'` fallback
  rather than hiding the row. An orphaned order is still work.

## Edge cases

- **A rental picked up with no `return_due_date`.** The field is optional. Such
  an order is not "out" in any trackable sense and is excluded from both the
  strip count and the Out-on-rental card, rather than being counted as due
  today.
- **A return date before the pickup date.** `OrderForm` already rejects this,
  so it can only arrive by replication from another client. It buckets as
  overdue, which is the honest reading.
- **An overpaid order** has a negative balance. Existing code filters on
  `balance > 0` throughout; the money clause and card follow the same rule, so
  an overpayment never appears as a negative figure in the hero.
- **A day with work but no open orders** — every order that day is already
  picked up — counts zero and renders a dot. The strip counts work outstanding,
  not history.
- **No active staff member.** The greeting drops the name rather than rendering
  "Good morning, ". Reachable transiently before the shop context resolves.
- **More than 99 on a day cell.** Renders `99+`; three digits does not fit the
  cell at 390px.

## Consequences and subtractions

Stated plainly, because these remove things that work today.

1. **Settings stops being a labelled tab.** It becomes a gear in the status
   strip. The `TabBar` header argues labels matter because this app's users
   "did not choose it and were not trained on it", and that argument applies
   here too — the mitigation is that the gear is on every screen rather than
   one, and is a gear rather than an avatar alone.
2. **`Fab` is deleted**, and with it the pattern of a per-screen floating
   action. Any screen later wanting one has to make the case again.
3. **The stage mix leaves Today.** A shop that used the chip row to see "four
   in progress" at a glance now goes to Reports for it.
4. **Today no longer shows every due order.** Four per bucket, then a link. A
   shop with six overdue orders sees four and a count.
5. **Reports gains a tab it may not deserve.** It is a weekly-review screen in
   a slot sized for daily use. Flagged in Open items.

## Testing

`todayModel.ts` is pure and gets `todayModel.test.ts` alongside it, matching
`orderStage.ts`. Cases, at minimum:

- `heroSegments()` across all four work-clause branches × money present/absent,
  asserting tones as well as text.
- Bucketing with rentals: an overdue return lands in Overdue; a future return
  lands in Out on rental; a `picked_up` rental with no `return_due_date` lands
  in neither.
- Day-strip counts: pickups only, returns only, both on one day, and the `99+`
  cap.
- The four-row cap and the `See all n` count.
- The empty-shop branch.

`dueBucket()`, `formatDueDate()` and `calculateBalance()` are already covered
and are not re-tested.

Not covered, consistent with `ARCHITECTURE.md` §11 and `X8`: the components
themselves. The point of N11 is that almost nothing worth testing remains in
them.

## Risks

**The raised centre button is the one piece that cannot be desk-verified.** It
overlaps the bar's top edge, sits above `env(safe-area-inset-bottom)`, and is
the most-tapped control in the app. Whether it clears the home indicator on a
real iPhone, and whether the overlap creates a dead zone on the two tabs
flanking it, needs hardware. Until then it is the highest-risk element here.

**Settings becomes harder to find.** A gear in a status strip is a smaller,
less-labelled target than a quarter of the tab bar. If a shop owner cannot find
Settings, N2 is wrong and the tab should come back at Reports' expense.

**T1's fix changes what Overdue means.** A shop used to Overdue meaning
"garments I owe people" will start seeing "items people owe me" in the same
list. The return label is what carries that distinction, and it is one word
doing a lot of work.

## Deferred

- **`order_stage_history` has no view** anywhere in the app (Phase 3). Today is
  not where it belongs, but it stays unsurfaced after this spec too.
- **`/orders?due=` and `/orders?filter=`** are consumed by N7 and N8. S1 adds
  only the parameter reading and the two new filter values to `Orders` as it
  stands; the screen's redesign is S2's.
- **Currency is still hardcoded to UGX** (`X5`). The hero and money card
  inherit that.

## Open items

- **N3 is the weakest decision here.** Reports takes the fourth tab largely
  because Settings vacated it, which is not a reason. The alternative is three
  destinations plus the centre action and no fourth tab. Worth revisiting once
  someone has used the app for a week and can say how often they open Reports.
- **The greeting is untested copy.** "Good morning, Nakato" above a hero that
  says two orders are late may read as tone-deaf. It is cheap to remove.
- **Whether the day strip survives contact with a real shop.** It is the one
  element taken from the reference material rather than derived from this app's
  jobs, and N6 justifies it by analogy. If it goes unused, it goes.
