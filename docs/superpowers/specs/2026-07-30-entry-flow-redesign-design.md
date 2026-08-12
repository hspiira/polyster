# Entry flow redesign — design

Date: 2026-07-30
Status: implemented, then partly superseded by
`2026-08-11-registration-redesign.md` — E3, E8 and E9, and the five-step setup
in "Screens", no longer describe the code. The rest still holds.
Scope: everything before the authenticated shell — landing, sign-in, first-run setup, and the PIN lock.

## Why

The signed-out half of the app has three problems that compound.

It **dead-ends**: there is no sign-up screen anywhere. `Login.tsx` is the only auth screen, and the README instructs owners to create accounts by hand in the Supabase dashboard — while D14 and `0004_shop_self_signup.sql` already permit self-service shop creation.

It **never asks to be installed**: nothing in the codebase captures `beforeinstallprompt`, and iOS never fires it. For an app whose premise is "works with no signal", running in a browser tab instead of installed is the difference between the product working and not.

It **decides from the wrong input**: `app.tsx` branches on `auth.status` alone, and `ShopProvider` mounts only after that decision. The code never asks whether the device has data, only whether it has a session — which is why `local_only` and `offline_stale` skip the landing entirely.

Underneath all of it, email-and-password is the wrong credential for the audience. Tailors in Uganda authenticate by phone number and a short code every day, through MTN MoMo and Airtel Money. This design adopts that.

## Review findings

Recorded so the rest of the document can be read as a response to something specific.

| # | Finding | File |
|---|---|---|
| F1 | No sign-up screen; the only door is `Login` | `src/screens/Landing.tsx`, `src/screens/Login.tsx` |
| F2 | Landing/Login unreachable in `local_only` and `offline_stale` | `src/app.tsx:45` |
| F3 | A one-staff shop skips the PIN gate entirely, so a solo owner never has a lock screen | `src/screens/StaffGate.tsx:35-37` |
| F4 | Back from the PIN phase jumps to step 1 and discards the typed name — the name/pin/confirm phases are not in the back stack | `src/screens/setup/SetupFlow.tsx:60-72` |
| F5 | The three-segment progress bar does not move across step 2's three internal phases | `src/screens/setup/SetupFlow.tsx:104` |
| F6 | `offline_stale` has no reconnect affordance anywhere in the entry path | `src/lib/auth.ts` |
| F7 | `Login` has no password recovery and no exit but back | `src/screens/Login.tsx` |
| F8 | No install prompt; `beforeinstallprompt` never captured | — |
| F9 | Cold start is four visual states, ending in a bare spinner on a background that does not match the manifest splash | `src/app.tsx:122-128` |
| F10 | Four adjacent screens use three visual systems; the first run flickers dark → light → light → dark on a light-mode phone | Landing/Login/SetupFlow/StaffGate |
| F11 | Landing dropped its three value claims, pointing at a "How this works" Settings entry that was never built | `src/screens/Landing.tsx:6-14` |
| F12 | Landing's CTA is a bespoke glass button because `ui.tsx` has no class-merge helper | `src/screens/Landing.tsx:50-56` |
| F13 | `signOut()` clears the session but leaves the entire local RxDB database intact | `src/lib/auth.ts:144-152`, `src/screens/Settings.tsx:111` |
| F14 | `ShopProvider` takes `shops[0]`; nothing prevents a second shop's row arriving in the same local database | `src/state/ShopProvider.tsx:72` |

## Decisions

| # | Decision | Rejected | Why |
|---|---|---|---|
| E1 | Phone number + one-time code. No password, ever. | Email + password | The credential the audience already uses daily. Also lets the code screen and the PIN screen be one component. |
| E2 | Channel-agnostic code delivery — config value, copy never names the medium | SMS-only; WhatsApp-first | Real per-message pricing for Uganda is not known yet. Screens are built so the choice stays open. |
| E3 | Self-serve setup, with an offline "start now, claim later" branch | Online-only signup; no in-app signup | Matches the offline-first premise. Accepts and sharpens D14's unreconciled-shop gap. |
| E4 | One identity per device. The lock screen shows one person, never a list. | Staff picker | A list of names invites signing in as someone else — and it is a list of exactly the people whose attribution the feature protects. |
| E5 | Lock on session lapse, plus a configurable idle auto-lock (default 5 min, `0` = never) | Lock on every open; today's lapse-only-with-auto-skip | A solo owner should not type six digits on every glance, but a phone left on a counter should not stay open. |
| E6 | Dark branded shell for every pre-shell screen; the themed app starts at the Shell | Themed throughout; today's dark/light split | Removes the flicker, and the manifest `background_color` (`#0f1e52`) already matches, so an installed cold start has no white flash. |
| E7 | Entry decision derives from `provisioned` (local shop + staff), with auth secondary | Deriving from `auth.status` | Fixes F2 at the root. Requires `ShopProvider` to mount as soon as the database is open. |
| E8 | Install asked quietly on the landing, firmly after setup | Landing-only; after-setup-only | The landing ask converts poorly before anyone knows what the app is; the after-setup ask misses anyone who bounces. |
| E9 | One landing button — "Continue with your phone number" | Two doors (create / sign in) | Sign-in and sign-up are the same three screens; only the backend knows which one this number is. |
| E10 | Fully rounded (pill) buttons and single-line inputs, app-wide via `--radius-control` | Entry screens only | A round entry flow feeding a square app would read as broken. Textareas and the search field keep the existing radius. |
| E11 | No back-arrow icons in the entry flow; swipe only, backed by real history entries | Chevron on each step | Matches what the PIN gate already does. History entries are what make it safe on Android too — see Risks. |
| E12 | No uppercase text treatment anywhere unless specifically asked for | `SectionTitle`'s `uppercase tracking-wider`; section dividers | House rule, applied app-wide. |
| E13 | The pad's backspace is the word "Delete", not an icon | `IconBackspace` | Unambiguous, and it matches the pad's existing `aria-label`. |
| E14 | Sign-out wipes the local database and returns to the landing | Today's session-only sign-out | Closes F13 and F14 together. **Provisional — flagged for revisit (see Open items).** |

## The entry state machine

`ShopProvider` mounts as soon as the database is open. The entry decision reads local data first.

```
db opening ──────────▶ Splash (branded, on #0f1e52)
db error ────────────▶ FatalError (unchanged)

   ShopProvider mounts here — local shop/staff now known

   provisioned = shop !== null && staff.length > 0

   provisioned?
    │
    ├─ no ──┬─ signed_in ──▶ Setup, resuming after verification
    │       └─ otherwise ──▶ Landing ──▶ Setup (steps 1–5) ──▶ Install epilogue
    │
    └─ yes ─┬─ locked ─────▶ PIN pad  (+ "sync paused" line if offline_stale)
            └─ unlocked ───▶ Shell
```

`locked` replaces today's `!activeStaff`. It is true when no staff member is selected for the session, **or** the idle timer has elapsed.

`offline_stale` does **not** itself lock. A token ageing out is invisible to the user and must not eject someone mid-order (D10). It changes only what the PIN pad says when it does appear.

**Auto-lock** lives in a new `useAutoLock` hook. `visibilitychange` stamps a timestamp on background; on return it compares elapsed time against a new `shop.lock_after_minutes` field. The timestamp sits in `sessionStorage` beside the active staff id so the two clear together.

## Screens

Every screen below is the dark branded shell: `stone-950`, `GlowBackdrop`, pill controls, no uppercase, no back-arrow icons.

### Landing

Unchanged in composition from today — logomark row, the two-weight hero statement, the glass button with the brand-500 circle arrow. Two changes:

- The button reads **"Continue with your phone number"**.
- A quiet **"Add to home screen"** chip sits below it, hidden when already running in `display-mode: standalone`.

The three value claims (F11) are **not** restored here. They remain unaddressed; the "How this works" entry they were moved to is still unbuilt.

### Setup — five steps, then an epilogue

A centred, narrow stepper. No chevrons. Each step pushes a history entry.

1. **Your phone number.** One field with a country prefix. Primary "Send code". Below it: "No signal right now? Set up on this device" — the offline branch.
2. **Enter the code.** The `PinPad` component: six dots, self-submitting on the last digit, "Delete". Resend with a cooldown.
3. **Your shop.** Shop name and your name. **The WhatsApp number is removed from setup** — optional, already editable in Settings, and step 1 could not carry it.
4. **Your PIN.** Chosen, then confirmed. The segment half-fills across the two phases rather than stalling (F5), and each phase is a real back entry (F4).
5. **What you measure.** Today's chips, restyled. Still skippable, still re-offered when first recording a client's measurements.

**Install epilogue.** Outside the stepper, because it is not part of creating a shop. Chromium fires the captured `beforeinstallprompt`; iOS gets Share → Add to Home Screen instructions. Skipped entirely when already standalone.

### Sign-in

The same three screens as setup — phone, code, PIN — differing only in that a shop already exists for the number. There is no separate sign-in screen to design.

The third screen differs in one way that matters. Once verification succeeds, replication pulls the shop and its staff row down, including the PIN hash:

- **A staff row exists for this account** — the PIN is *entered*, not chosen, and verified against the replicated hash. This is the returning-owner-on-a-new-handset path.
- **No staff row exists** — the account has no shop yet, so this is setup, and the PIN is *chosen and confirmed* as step 4.

The screen therefore cannot decide which it is until the first pull completes. Until then it shows the branded splash, not a pad — offering "Choose a PIN" to someone who already has one would overwrite it.

### Lock screen

One avatar, one name, the shop name, one pad. No list (E4). Swipe does nothing here — there is nowhere behind it.

In `offline_stale` it carries a "Working offline — sync is paused" banner, per ARCHITECTURE §9. Deliberately no "sign in again" button: it would fail with no signal, which is the condition that produced the state.

A **"Forgotten your PIN?"** link is reachable from this screen and leads to phone re-verification.

## Visual system changes

These touch `ui.tsx` and `index.css`, so they land beyond the entry flow.

- `--radius-control` becomes fully round. `Button`, `Input`, `Select` and `Chip` become pills; `Textarea` and `SearchInput` keep the current radius.
- Pill fields need more horizontal padding (~18px vs 12px) or text sits on the curve. Field labels and hints inset to match.
- `SectionTitle` loses `uppercase tracking-wider` (E12).
- `ui.tsx` gains a class-merge helper so one-off variants stop being hand-rolled (F12).
- `Splash` gets the logomark and `#0f1e52`, matching the manifest (F9).

## Edge cases

- **Forgotten PIN** is a locked-out shop. Recovery is phone re-verification, then a new PIN. Needs a connection, correctly — it is the only thing that proves identity.
- **Wrong PIN** gets an escalating delay after ~5 failures. Not a lockout: a shop must never be unable to open its own till.
- **Offline claim conflict.** Setting up offline and later claiming a number that already has a shop produces two shops. D14 records this as accepted and unreconciled; phone-first makes it more likely, because claiming is now a normal step. Minimum viable answer: detect at claim time and make the user choose which shop this device keeps.
- **`local_only` builds** must route straight to the offline setup branch. "Continue with your phone number" cannot work without Supabase env vars and must not be shown.
- **PIN verification is local** (PBKDF2 against the replicated hash), so `offline_stale` unlocks with no network. Unchanged.
- **Code delivery fails or is rate-limited** — surfaced on the code screen with the resend cooldown, never thrown.

## Consequences and subtractions

Stated plainly, because these remove things that work today.

1. **A shop has exactly one person on it: the owner.** "Different staff, different phones" means a staff member signs in on their own handset with their own number — which is the deferred multi-user model. Until it lands, `StaffSettings`' create-a-staff-member-and-set-their-PIN is incoherent and should go dark. Adding staff becomes "invite by phone number" when multi-user ships.
2. **Shared shop phones are no longer supported.** Confirmed as intended.
3. **A solo owner now sees a lock screen** where today they see none (F3). Auto-lock at 5 minutes limits how often.
4. **The WhatsApp number leaves setup.** An owner who never opens Settings sends messages from a shop with no number on file.
5. **Sign-out destroys local data** (E14). Provisional.

## Deferred

Not in scope, but the schema should leave room:

- A person belonging to several shops, with an in-app shop switcher. This wants a `users` identity distinct from `staff` membership, even while the app only ever shows one.
- Staff invitation by phone number.

## Risks

**Dropping the chevron is only safe with history entries.** The wizard keeps its step in local state today, so it has no history. On Android the system back gesture *is* the back gesture — with no chevron and no history, back leaves the app instead of stepping back. Each step must push an entry; `useSwipeBack` hangs off the same mechanism.

**Code delivery costs money per message** in a project that chose Cloudflare specifically to avoid surprise bills (D3). E2 defers the channel choice, not the cost.

**Nothing here has run on a phone.** ARCHITECTURE §11 is explicit that no part of this app has. OTP delivery, iOS install, and swipe-back in a standalone PWA cannot be verified in a desktop browser.

## Testing

Screen behaviour has no automated coverage today (ARCHITECTURE §11). The entry flow is the wrong place to keep that gap — every user takes this path, and most of its logic is pure.

- **Unit, new:** the entry state machine (`provisioned` × auth status × `locked` → screen); auto-lock elapsed-time logic; phone normalisation to E.164 (extend `toWaNumber`, do not duplicate it); OTP resend cooldown; PIN failure-backoff schedule.
- **Unit, existing:** `pin.ts` stays as is.
- **Screen-level:** the wizard's back/history behaviour, which is what dropping the chevron makes fragile.
- **Manual, on real hardware:** code delivery, install on iOS Safari, swipe-back in a standalone PWA.

## Open items

- **E14 (sign-out wipes local data) is provisional** — approved "for now". It closes F13 and F14, but destroying a shop's only local copy on a mistaken tap is a serious failure mode and deserves either a confirmation step or a different answer.
- **The `Screen` primitive still renders a back chevron** for in-app navigation. E11 covers the entry flow only. Whether the no-back-arrow rule extends to the whole app is undecided.
- **F11 (the missing value claims) is unresolved.** The landing keeps its current composition, so the claims still live nowhere.
