# Phone-First Entry Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the email/password entry flow with a phone-number-and-code flow, make the entry decision from local data rather than auth status, and give the app a lock screen and an install prompt.

**Architecture:** `ShopProvider` mounts as soon as the local database opens, so a pure selector (`lib/entryState.ts`) can decide the screen from `provisioned × auth status × locked`. Setup becomes five steps plus an install epilogue, each step pushing a history entry so swipe-back and Android system-back behave identically. The PIN pad component serves both the OTP code screen and the PIN screen.

**Tech Stack:** Preact, `preact-iso`, Tailwind CSS v4, RxDB, `supabase-js` v2, Vitest.

**Spec:** [`docs/superpowers/specs/2026-07-30-entry-flow-redesign-design.md`](../specs/2026-07-30-entry-flow-redesign-design.md)

## Global Constraints

- **No uppercase text treatment** anywhere unless explicitly asked for. Remove `uppercase tracking-wider` wherever it appears. (Spec E12)
- **No back-arrow icons in the entry flow.** Back is swipe plus history only. (Spec E11)
- **Pill controls:** `--radius-control` becomes fully round. `Textarea` and `SearchInput` keep the current radius. (Spec E10)
- **Every pre-shell screen is the dark branded shell:** `bg-stone-950`, `GlowBackdrop`, no `prefers-color-scheme` branching. (Spec E6)
- **PIN length is 6**, from `PIN_LENGTH` in `src/lib/pin.ts`. Never hardcode it.
- **Code comments: 1–2 lines.** Longer rationale belongs in `docs/`.
- **Commits carry no AI co-authorship trailer.**
- `pnpm verify` (typecheck + vitest + build) must pass before any commit.
- Currency, dates and money helpers are untouched by this plan.

## Prerequisite that blocks Task 5's manual verification

`signInWithOtp({ phone })` requires an SMS or WhatsApp provider (Twilio, Vonage, MessageBird, TextLocal) configured under **Authentication → Providers → Phone** in the Supabase dashboard, with billing attached. **This cannot be done from the codebase.** Every task below is implementable and unit-testable without it; only the "a real code arrives on a real handset" check in Task 5 is blocked. Note that `.env` does not currently exist in this repo — only `.env.example` — and per `README.md` nothing in this app has ever run against Supabase.

## File Structure

**New:**
- `src/lib/phone.ts` — E.164 normalisation and display formatting. Wraps `toWaNumber`.
- `src/lib/lockPolicy.ts` — pure: is the device locked, and the wrong-PIN backoff schedule.
- `src/lib/entryState.ts` — pure: which entry screen to show.
- `src/hooks/useAutoLock.ts` — `visibilitychange` timestamping around `lockPolicy`.
- `src/hooks/useInstallPrompt.ts` — captures `beforeinstallprompt`, detects standalone and iOS.
- `src/hooks/useWizardSteps.ts` — step state backed by real history entries.
- `src/screens/entry/Landing.tsx` — moved from `src/screens/Landing.tsx`.
- `src/screens/entry/SetupFlow.tsx` — rewritten, five steps.
- `src/screens/entry/steps/{PhoneStep,CodeStep,ShopStep,PinStep,MeasureStep}.tsx`
- `src/screens/entry/InstallStep.tsx`
- `src/screens/entry/LockScreen.tsx` — replaces `StaffGate.tsx`.
- `src/screens/entry/Shell.tsx` **no** — the app shell is unchanged.

**Modified:**
- `src/index.css` — `--radius-control`.
- `src/components/ui.tsx` — pills, `cn()`, no uppercase.
- `src/components/PinPad.tsx` — "Delete" word, dark default.
- `src/lib/auth.ts` — phone OTP, injectable client.
- `src/app.tsx` — new state machine, `ShopProvider` mount order.
- `src/screens/Settings.tsx` — sign-out copy and behaviour.
- `src/screens/settings/StaffSettings.tsx` — create-staff path goes dark.

**Deleted:**
- `src/screens/Login.tsx`, `src/screens/StaffGate.tsx`, `src/screens/Landing.tsx`, `src/screens/setup/SetupFlow.tsx`.

---

### Task 1: Pill controls, no uppercase, class-merge helper

**Files:**
- Modify: `src/index.css:31`
- Modify: `src/components/ui.tsx`
- Test: `src/components/cn.test.ts` (create)

**Interfaces:**
- Consumes: nothing.
- Produces: `cn(...parts: (string | false | null | undefined)[]): string` from `src/components/ui.tsx`. Every later task uses it instead of template-literal class concatenation.

- [ ] **Step 1: Write the failing test**

```ts
// src/components/cn.test.ts
import { describe, expect, it } from 'vitest'
import { cn } from './ui'

describe('cn', () => {
  it('joins truthy parts with a single space', () => {
    expect(cn('a', 'b')).toBe('a b')
  })

  it('drops falsy parts so conditionals read inline', () => {
    expect(cn('a', false, null, undefined, 'b')).toBe('a b')
  })

  it('collapses the whitespace that multiline class strings introduce', () => {
    expect(cn('a\n   b', 'c')).toBe('a b c')
  })

  it('returns an empty string when everything is falsy', () => {
    expect(cn(false, null)).toBe('')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/components/cn.test.ts`
Expected: FAIL — `cn` is not exported from `./ui`.

- [ ] **Step 3: Add `cn` to `src/components/ui.tsx`**

Add near the top, after the imports:

```ts
/** Joins class parts, dropping falsy ones and collapsing whitespace. */
export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/components/cn.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Make controls pills**

In `src/index.css`, change the control radius token and leave `--radius-card` alone:

```css
  --radius-card: 1rem;
  /* Fully round: buttons, inputs and chips read as things you touch.
     Textarea and search keep a boxed radius of their own. */
  --radius-control: 999px;
```

In `src/components/ui.tsx`, give the two exceptions their own radius. Change the `CONTROL` constant's `rounded-control` to `rounded-[0.75rem]` **only** inside `Textarea` and `SearchInput` by splitting the shared constant:

```ts
const CONTROL_BASE = `w-full border border-stone-300 bg-white px-4
                 text-base text-stone-900 outline-none transition-colors
                 placeholder:text-stone-400
                 focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20
                 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100
                 dark:placeholder:text-stone-500`

/** Pill fields need more horizontal padding or the text sits on the curve. */
const CONTROL = cn(CONTROL_BASE, 'rounded-control px-4.5')
const CONTROL_BOXED = cn(CONTROL_BASE, 'rounded-[0.75rem]')
```

Then use `CONTROL_BOXED` in `Textarea` and `SearchInput`, and `CONTROL` in `Input` and `Select`.

- [ ] **Step 6: Remove the uppercase treatment**

In `src/components/ui.tsx`, `SectionTitle` currently reads
`text-xs font-semibold uppercase tracking-wider`. Change it to:

```tsx
      <h2 class={cn('text-xs font-semibold tracking-wide', TEXT_MUTED)}>{children}</h2>
```

- [ ] **Step 7: Confirm nothing else uppercases**

Run: `grep -rn "uppercase" src/`
Expected: no matches. If any remain, remove them — Global Constraints.

- [ ] **Step 8: Verify and commit**

Run: `pnpm verify`
Expected: typecheck clean, all tests pass, build succeeds.

```bash
git add src/index.css src/components/ui.tsx src/components/cn.test.ts
git commit -m "feat(ui): pill controls, a class-merge helper, and no uppercase"
```

---

### Task 2: Phone number normalisation

**Files:**
- Create: `src/lib/phone.ts`
- Test: `src/lib/phone.test.ts`

**Interfaces:**
- Consumes: `toWaNumber(phone, defaultCountryCode?)` from `src/lib/whatsapp.ts`.
- Produces:
  - `toE164(phone: string, defaultCountryCode?: string): string | null`
  - `formatPhoneForDisplay(e164: string): string`
  - `DEFAULT_COUNTRY_CODE: '256'`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/phone.test.ts
import { describe, expect, it } from 'vitest'
import { DEFAULT_COUNTRY_CODE, formatPhoneForDisplay, toE164 } from './phone'

describe('toE164', () => {
  it('defaults to Uganda, matching the rest of the app', () => {
    expect(DEFAULT_COUNTRY_CODE).toBe('256')
  })

  it.each([
    ['0700000000', '+256700000000', 'national with a trunk zero'],
    ['+256700000000', '+256700000000', 'already international'],
    ['256700000000', '+256700000000', 'international without the plus'],
    ['+256 700 000 000', '+256700000000', 'spaced'],
    ['0700-000-000', '+256700000000', 'hyphenated'],
  ])('%s -> %s (%s)', (input, expected) => {
    expect(toE164(input)).toBe(expected)
  })

  it.each([
    ['', 'empty'],
    ['   ', 'whitespace only'],
    ['12345', 'too short to be a phone number'],
    ['700000000', 'ambiguous: no trunk zero, no country code'],
    ['not a number', 'not digits at all'],
  ])('returns null for %s (%s)', (input) => {
    expect(toE164(input)).toBeNull()
  })

  it('honours a different default country code', () => {
    expect(toE164('0712345678', '254')).toBe('+254712345678')
  })
})

describe('formatPhoneForDisplay', () => {
  it('groups the subscriber digits so a code screen can be checked at a glance', () => {
    expect(formatPhoneForDisplay('+256700000000')).toBe('+256 700 000 000')
  })

  it('returns anything it cannot group unchanged rather than mangling it', () => {
    expect(formatPhoneForDisplay('+1555')).toBe('+1555')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/phone.test.ts`
Expected: FAIL — cannot resolve `./phone`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/phone.ts
/**
 * Phone numbers as identity (ARCHITECTURE D4 successor, spec E1).
 *
 * Normalisation is deliberately `toWaNumber`'s, not a second opinion: a number
 * that reaches WhatsApp and a number that receives a code must be the same
 * number, or a shop verifies one identity and messages from another.
 */
import { toWaNumber } from './whatsapp'

export const DEFAULT_COUNTRY_CODE = '256'

/** E.164 (`+256700000000`), or null when the number is ambiguous. */
export function toE164(phone: string, defaultCountryCode = DEFAULT_COUNTRY_CODE): string | null {
  const digits = toWaNumber(phone, defaultCountryCode)
  return digits ? `+${digits}` : null
}

/** `+256 700 000 000` -- grouped for reading back, never for storage. */
export function formatPhoneForDisplay(e164: string): string {
  const match = /^(\+\d{1,3})(\d{3})(\d{3})(\d{3,})$/.exec(e164)
  if (!match) return e164
  return `${match[1]} ${match[2]} ${match[3]} ${match[4]}`
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/lib/phone.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/phone.ts src/lib/phone.test.ts
git commit -m "feat(auth): normalise phone numbers to E.164"
```

---

### Task 3: Lock policy — idle timeout and wrong-PIN backoff

**Files:**
- Create: `src/lib/lockPolicy.ts`
- Test: `src/lib/lockPolicy.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `DEFAULT_LOCK_AFTER_MINUTES: 5`
  - `isLockedByIdle(backgroundedAt: number | null, now: number, lockAfterMinutes: number): boolean`
  - `backoffMs(consecutiveFailures: number): number`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/lockPolicy.test.ts
import { describe, expect, it } from 'vitest'
import { DEFAULT_LOCK_AFTER_MINUTES, backoffMs, isLockedByIdle } from './lockPolicy'

const MIN = 60_000

describe('isLockedByIdle', () => {
  it('defaults to five minutes', () => {
    expect(DEFAULT_LOCK_AFTER_MINUTES).toBe(5)
  })

  it('does not lock an app that was never backgrounded', () => {
    expect(isLockedByIdle(null, 1_000_000, 5)).toBe(false)
  })

  it('does not lock before the timeout elapses', () => {
    expect(isLockedByIdle(0, 4 * MIN, 5)).toBe(false)
  })

  it('locks once the timeout elapses exactly', () => {
    expect(isLockedByIdle(0, 5 * MIN, 5)).toBe(true)
  })

  it('locks well past the timeout', () => {
    expect(isLockedByIdle(0, 90 * MIN, 5)).toBe(true)
  })

  it('never locks when the timeout is zero', () => {
    expect(isLockedByIdle(0, 10_000 * MIN, 0)).toBe(false)
  })

  // A device whose clock moved backwards must not be treated as "backgrounded
  // for negative time" and silently left unlocked forever.
  it('locks when the clock has gone backwards', () => {
    expect(isLockedByIdle(10 * MIN, 1 * MIN, 5)).toBe(true)
  })
})

describe('backoffMs', () => {
  it('does not delay the first attempts', () => {
    expect(backoffMs(0)).toBe(0)
    expect(backoffMs(4)).toBe(0)
  })

  it('starts delaying from the fifth failure', () => {
    expect(backoffMs(5)).toBe(1_000)
  })

  it('doubles with each further failure', () => {
    expect(backoffMs(6)).toBe(2_000)
    expect(backoffMs(7)).toBe(4_000)
  })

  // A shop must never be unable to open its own till, so this is a delay with
  // a ceiling, not a lockout.
  it('caps at thirty seconds', () => {
    expect(backoffMs(50)).toBe(30_000)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/lockPolicy.test.ts`
Expected: FAIL — cannot resolve `./lockPolicy`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/lockPolicy.ts
/**
 * When the device locks, and how hard it pushes back on a wrong PIN.
 *
 * The PIN is attribution, not a security boundary (ARCHITECTURE D4), so this
 * delays rather than locks out -- a shop must never be unable to open its own
 * till.
 */
export const DEFAULT_LOCK_AFTER_MINUTES = 5

const FREE_ATTEMPTS = 5
const FIRST_DELAY_MS = 1_000
const MAX_DELAY_MS = 30_000

/** `lockAfterMinutes` of 0 means never. */
export function isLockedByIdle(
  backgroundedAt: number | null,
  now: number,
  lockAfterMinutes: number,
): boolean {
  if (backgroundedAt === null) return false
  if (lockAfterMinutes <= 0) return false
  const elapsed = now - backgroundedAt
  // A backwards clock cannot be reasoned about, so fail closed and lock.
  if (elapsed < 0) return true
  return elapsed >= lockAfterMinutes * 60_000
}

export function backoffMs(consecutiveFailures: number): number {
  if (consecutiveFailures < FREE_ATTEMPTS) return 0
  const doublings = consecutiveFailures - FREE_ATTEMPTS
  return Math.min(FIRST_DELAY_MS * 2 ** doublings, MAX_DELAY_MS)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/lib/lockPolicy.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/lockPolicy.ts src/lib/lockPolicy.test.ts
git commit -m "feat(auth): idle lock timing and wrong-PIN backoff"
```

---

### Task 4: The entry decision, as a pure function

**Files:**
- Create: `src/lib/entryState.ts`
- Test: `src/lib/entryState.test.ts`

**Interfaces:**
- Consumes: `AuthState` from `src/lib/auth.ts` (its existing four statuses; Task 5 adds none).
- Produces:
  - `type EntryScreen = 'splash' | 'fatal' | 'landing' | 'setup' | 'lock' | 'shell'`
  - `interface EntryInput { dbStatus: 'loading' | 'ready' | 'error'; authStatus: AuthState['status']; provisioned: boolean; locked: boolean }`
  - `decideEntryScreen(input: EntryInput): EntryScreen`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/entryState.test.ts
import { describe, expect, it } from 'vitest'
import { decideEntryScreen, type EntryInput } from './entryState'

function input(over: Partial<EntryInput> = {}): EntryInput {
  return {
    dbStatus: 'ready',
    authStatus: 'signed_out',
    provisioned: false,
    locked: true,
    ...over,
  }
}

describe('decideEntryScreen', () => {
  it('shows the splash while the database opens', () => {
    expect(decideEntryScreen(input({ dbStatus: 'loading' }))).toBe('splash')
  })

  it('shows the splash while auth is still being checked', () => {
    expect(decideEntryScreen(input({ authStatus: 'checking' }))).toBe('splash')
  })

  it('a database failure beats everything else', () => {
    expect(decideEntryScreen(input({ dbStatus: 'error', provisioned: true, locked: false })))
      .toBe('fatal')
  })

  // The whole point of the redesign: local data decides, not the session.
  it('sends an unprovisioned device to the landing screen', () => {
    expect(decideEntryScreen(input({ provisioned: false }))).toBe('landing')
  })

  it('sends an unprovisioned but signed-in device straight to setup', () => {
    expect(decideEntryScreen(input({ provisioned: false, authStatus: 'signed_in' })))
      .toBe('setup')
  })

  it('locks a provisioned device', () => {
    expect(decideEntryScreen(input({ provisioned: true, locked: true }))).toBe('lock')
  })

  it('opens the app on a provisioned, unlocked device', () => {
    expect(decideEntryScreen(input({ provisioned: true, locked: false }))).toBe('shell')
  })

  // Regression: these two used to skip the landing entirely (finding F2).
  it.each(['local_only', 'offline_stale'] as const)(
    'still shows the landing to an unprovisioned %s device',
    (authStatus) => {
      expect(decideEntryScreen(input({ authStatus, provisioned: false }))).toBe('landing')
    },
  )

  // Regression: a lapsed session must not eject anyone to a sign-in screen.
  it('locks rather than landing when a provisioned device has gone stale', () => {
    expect(decideEntryScreen(input({ authStatus: 'offline_stale', provisioned: true })))
      .toBe('lock')
  })

  it('locks rather than landing when a provisioned device is signed out', () => {
    expect(decideEntryScreen(input({ authStatus: 'signed_out', provisioned: true })))
      .toBe('lock')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/entryState.test.ts`
Expected: FAIL — cannot resolve `./entryState`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/entryState.ts
/**
 * Which screen the app shows before the shell.
 *
 * Pure and exhaustively tested because this is the one path every user takes,
 * and because deriving it from `auth.status` alone is what made `local_only`
 * and `offline_stale` skip the landing (spec F2, E7).
 */
import type { AuthState } from './auth'

export type EntryScreen = 'splash' | 'fatal' | 'landing' | 'setup' | 'lock' | 'shell'

export interface EntryInput {
  dbStatus: 'loading' | 'ready' | 'error'
  authStatus: AuthState['status']
  /** A shop row and at least one staff row exist locally. */
  provisioned: boolean
  locked: boolean
}

export function decideEntryScreen({
  dbStatus,
  authStatus,
  provisioned,
  locked,
}: EntryInput): EntryScreen {
  if (dbStatus === 'error') return 'fatal'
  if (dbStatus === 'loading' || authStatus === 'checking') return 'splash'

  if (provisioned) return locked ? 'lock' : 'shell'

  // Verified but nothing set up yet: resume mid-setup rather than re-asking
  // for a number that has already been confirmed.
  return authStatus === 'signed_in' ? 'setup' : 'landing'
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/lib/entryState.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/entryState.ts src/lib/entryState.test.ts
git commit -m "feat(entry): decide the entry screen from local data, not the session"
```

---

### Task 5: Phone OTP in the auth controller

**Files:**
- Modify: `src/lib/auth.ts`
- Test: `src/lib/auth.test.ts` (create)
- Modify: `.env.example`

**Interfaces:**
- Consumes: `toE164` from `src/lib/phone.ts`.
- Produces, on `AuthController`:
  - `requestCode(phone: string): Promise<void>` — replaces nothing; new.
  - `verifyCode(phone: string, token: string): Promise<void>` — new.
  - `signOut(): Promise<void>` — unchanged signature.
  - `refresh(): Promise<void>`, `getState()`, `subscribe()`, `dispose()` — unchanged.
  - **`signIn(email, password)` is removed.**
  - `createAuthController(deps?: AuthDeps): AuthController` — `deps` exists so tests can inject a fake client.
- `AuthState` is unchanged: `checking | local_only | signed_out | signed_in | offline_stale`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/auth.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createAuthController, type AuthDeps } from './auth'

function fakeDeps(over: Partial<AuthDeps> = {}): AuthDeps {
  return {
    isConfigured: () => true,
    getSession: async () => null,
    onAuthStateChange: () => () => {},
    signInWithOtp: vi.fn(async () => {}),
    verifyOtp: vi.fn(async () => ({ userId: 'user-1' })),
    signOut: async () => {},
    channel: 'sms',
    ...over,
  }
}

beforeEach(() => {
  localStorage.clear()
})

describe('createAuthController', () => {
  it('reports local_only when Supabase is not configured', () => {
    const auth = createAuthController(fakeDeps({ isConfigured: () => false }))
    expect(auth.getState().status).toBe('local_only')
  })

  it('refuses to send a code when Supabase is not configured', async () => {
    const auth = createAuthController(fakeDeps({ isConfigured: () => false }))
    await expect(auth.requestCode('0700000000')).rejects.toThrow(/not configured/i)
  })

  it('normalises the number before sending a code', async () => {
    const signInWithOtp = vi.fn(async () => {})
    const auth = createAuthController(fakeDeps({ signInWithOtp }))
    await auth.requestCode('0700 000 000')
    expect(signInWithOtp).toHaveBeenCalledWith('+256700000000', 'sms')
  })

  it('rejects a number it cannot make sense of, without calling out', async () => {
    const signInWithOtp = vi.fn(async () => {})
    const auth = createAuthController(fakeDeps({ signInWithOtp }))
    await expect(auth.requestCode('12345')).rejects.toThrow(/phone number/i)
    expect(signInWithOtp).not.toHaveBeenCalled()
  })

  it('signs in once a code verifies', async () => {
    const auth = createAuthController(fakeDeps())
    await auth.verifyCode('0700000000', '123456')
    expect(auth.getState()).toEqual({ status: 'signed_in', userId: 'user-1' })
  })

  it('normalises the number when verifying too', async () => {
    const verifyOtp = vi.fn(async () => ({ userId: 'user-1' }))
    const auth = createAuthController(fakeDeps({ verifyOtp }))
    await auth.verifyCode('0700 000 000', '123456')
    expect(verifyOtp).toHaveBeenCalledWith('+256700000000', '123456')
  })

  it('remembers the user so a later cold start lands on offline_stale', async () => {
    const auth = createAuthController(fakeDeps())
    await auth.verifyCode('0700000000', '123456')

    const next = createAuthController(fakeDeps())
    await Promise.resolve()
    expect(next.getState()).toEqual({ status: 'offline_stale', userId: 'user-1' })
  })

  it('forgets the user on sign-out so the next start is signed_out', async () => {
    const auth = createAuthController(fakeDeps())
    await auth.verifyCode('0700000000', '123456')
    await auth.signOut()
    expect(auth.getState().status).toBe('signed_out')

    const next = createAuthController(fakeDeps())
    await Promise.resolve()
    expect(next.getState().status).toBe('signed_out')
  })

  it('sends the code over the configured channel', async () => {
    const signInWithOtp = vi.fn(async () => {})
    const auth = createAuthController(fakeDeps({ signInWithOtp, channel: 'whatsapp' }))
    await auth.requestCode('0700000000')
    expect(signInWithOtp).toHaveBeenCalledWith('+256700000000', 'whatsapp')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/auth.test.ts`
Expected: FAIL — `AuthDeps` is not exported and `createAuthController` takes no argument.

- [ ] **Step 3: Rewrite the moving parts of `src/lib/auth.ts`**

Keep the existing file header, `AuthState`, `AuthListener`, `rememberUser`, `forgetUser`, `rememberedUser` and `applySession` exactly as they are. Replace the `AuthController` interface, add `AuthDeps`, and rewrite `createAuthController`'s body:

```ts
import { toE164 } from './phone'

/** Delivery channel. Config, not a code decision -- see spec E2. */
export type CodeChannel = 'sms' | 'whatsapp'

/**
 * The Supabase surface this module uses, injectable so the controller can be
 * tested without a project or an SMS provider.
 */
export interface AuthDeps {
  isConfigured(): boolean
  getSession(): Promise<{ userId: string } | null>
  onAuthStateChange(handler: (session: { userId: string } | null) => void): () => void
  signInWithOtp(e164: string, channel: CodeChannel): Promise<void>
  verifyOtp(e164: string, token: string): Promise<{ userId: string }>
  signOut(): Promise<void>
  channel: CodeChannel
}

export interface AuthController {
  getState(): AuthState
  subscribe(listener: AuthListener): () => void
  /** Sends a one-time code. Throws if the number is ambiguous or sync is unconfigured. */
  requestCode(phone: string): Promise<void>
  verifyCode(phone: string, token: string): Promise<void>
  signOut(): Promise<void>
  refresh(): Promise<void>
  dispose(): void
}

export function createAuthController(deps: AuthDeps = supabaseDeps()): AuthController {
  let state: AuthState = { status: 'checking' }
  const listeners = new Set<AuthListener>()

  function setState(next: AuthState): void {
    state = next
    listeners.forEach((listener) => listener(state))
  }

  function applySession(session: { userId: string } | null): void {
    if (session) {
      rememberUser(session.userId)
      setState({ status: 'signed_in', userId: session.userId })
      return
    }
    const remembered = rememberedUser()
    setState(
      remembered
        ? { status: 'offline_stale', userId: remembered }
        : { status: 'signed_out' },
    )
  }

  let unsubscribeAuth: (() => void) | null = null

  if (!deps.isConfigured()) {
    setState({ status: 'local_only' })
  } else {
    void deps.getSession().then(applySession).catch(() => applySession(null))
    unsubscribeAuth = deps.onAuthStateChange(applySession)
  }

  function requireE164(phone: string): string {
    if (!deps.isConfigured()) {
      throw new Error('Sync is not configured in this build, so codes cannot be sent.')
    }
    const e164 = toE164(phone)
    if (!e164) throw new Error('That phone number was not recognised. Check it and try again.')
    return e164
  }

  return {
    getState: () => state,

    subscribe(listener) {
      listeners.add(listener)
      listener(state)
      return () => listeners.delete(listener)
    },

    async requestCode(phone) {
      await deps.signInWithOtp(requireE164(phone), deps.channel)
    },

    async verifyCode(phone, token) {
      const { userId } = await deps.verifyOtp(requireE164(phone), token)
      applySession({ userId })
    },

    async signOut() {
      forgetUser()
      if (deps.isConfigured()) await deps.signOut()
      setState({ status: 'signed_out' })
    },

    async refresh() {
      if (!deps.isConfigured()) return
      try {
        applySession(await deps.getSession())
      } catch {
        applySession(null)
      }
    },

    dispose() {
      unsubscribeAuth?.()
      listeners.clear()
    },
  }
}
```

- [ ] **Step 4: Add the real Supabase implementation of `AuthDeps`**

Append to `src/lib/auth.ts`:

```ts
/**
 * The real client. `verifyOtp`'s `type` is 'sms' for both channels -- the
 * channel picks how the code is delivered, not how it is checked.
 */
function supabaseDeps(): AuthDeps {
  const channel = (import.meta.env.VITE_CODE_CHANNEL as CodeChannel) || 'sms'

  return {
    channel,
    isConfigured: isSupabaseConfigured,

    async getSession() {
      const { data } = await getSupabase().auth.getSession()
      return data.session?.user ? { userId: data.session.user.id } : null
    },

    onAuthStateChange(handler) {
      const { data } = getSupabase().auth.onAuthStateChange((_event, session) => {
        handler(session?.user ? { userId: session.user.id } : null)
      })
      return () => data.subscription.unsubscribe()
    },

    async signInWithOtp(e164, sendOn) {
      const { error } = await getSupabase().auth.signInWithOtp({
        phone: e164,
        options: { channel: sendOn },
      })
      if (error) throw error
    },

    async verifyOtp(e164, token) {
      const { data, error } = await getSupabase().auth.verifyOtp({
        phone: e164,
        token,
        type: 'sms',
      })
      if (error) throw error
      if (!data.session?.user) throw new Error('That code did not work. Ask for a new one.')
      return { userId: data.session.user.id }
    },

    async signOut() {
      // `local` scope: signing out here must not end the session on the shop's other phone.
      await getSupabase().auth.signOut({ scope: 'local' })
    },
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run src/lib/auth.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 6: Document the new env var**

Append to `.env.example`:

```
# How one-time codes reach a phone: sms (default) or whatsapp.
# Requires a provider configured under Authentication -> Providers -> Phone
# in the Supabase dashboard. Without one, codes are never delivered.
VITE_CODE_CHANNEL=sms
```

- [ ] **Step 7: Verify and commit**

Run: `pnpm verify`
Expected: PASS. `src/screens/Login.tsx` still calls the deleted `signIn` — delete that file now as part of this commit, since nothing routes to it after Task 10.

```bash
git rm src/screens/Login.tsx
git add src/lib/auth.ts src/lib/auth.test.ts .env.example
git commit -m "feat(auth): sign in with a phone number and a one-time code"
```

- [ ] **Step 8: Manual check — BLOCKED, record the result**

Cannot be done until an SMS or WhatsApp provider is configured in the Supabase dashboard. When it is: run `pnpm dev`, enter a real number, confirm a code arrives and verifies. Until then, note in the PR that this path is unit-tested only and has never delivered a real message.

---

### Task 6: PIN pad — "Delete" as a word, dark by default

**Files:**
- Modify: `src/components/PinPad.tsx`

**Interfaces:**
- Consumes: `cn` from `src/components/ui.tsx`, `PIN_LENGTH` from `src/lib/pin.ts`.
- Produces: `PinPad` with an unchanged prop signature except that `tone` now defaults to `'dark'`. `IconBackspace` is no longer imported.

- [ ] **Step 1: Replace the backspace icon with the word**

In `src/components/PinPad.tsx`, remove the `IconBackspace` import and change the delete key so it renders text:

```tsx
        {pin.length > 0 ? (
          <PadKey label="Delete" ghost tone={tone} disabled={busy} onPress={() => press('del')} />
        ) : (
          <span />
        )}
```

Then delete the `icon` prop from `PadKey` entirely — nothing passes it now — and shrink the label for the word:

```tsx
      class={cn(
        'flex size-18 items-center justify-center rounded-full transition-transform',
        'duration-75 active:scale-90 disabled:opacity-40',
        ghost ? 'text-sm font-medium' : 'text-2xl font-normal',
        ghost
          ? dark
            ? 'text-stone-300 active:bg-white/10'
            : 'text-stone-500 active:bg-stone-200'
          : dark
            ? 'border border-white/10 bg-white/5 text-stone-100 backdrop-blur-md active:bg-white/10'
            : 'border border-stone-200/80 bg-white shadow-card active:bg-stone-100',
      )}
```

- [ ] **Step 2: Default the tone to dark**

Every remaining caller is a dark entry screen, so flip the default:

```tsx
  tone = 'dark',
```

Update the JSDoc line above `tone` to say the light tone is unused for now but kept for in-app PIN changes in Settings.

- [ ] **Step 3: Check nothing still passes an icon**

Run: `grep -rn "IconBackspace" src/`
Expected: only `src/components/icons.tsx`, where the export stays.

- [ ] **Step 4: Verify and commit**

Run: `pnpm verify`
Expected: PASS.

```bash
git add src/components/PinPad.tsx
git commit -m "feat(ui): spell out Delete on the pad instead of an icon"
```

---

### Task 7: Auto-lock hook

**Files:**
- Create: `src/hooks/useAutoLock.ts`

**Interfaces:**
- Consumes: `isLockedByIdle`, `DEFAULT_LOCK_AFTER_MINUTES` from `src/lib/lockPolicy.ts`.
- Produces: `useAutoLock(lockAfterMinutes: number, onLock: () => void): void`

- [ ] **Step 1: Write the hook**

```ts
// src/hooks/useAutoLock.ts
/**
 * Locks the app after it has been in the background too long.
 *
 * `visibilitychange` rather than a timer: a backgrounded tab's timers are
 * throttled or frozen, so counting while away is not something a phone will
 * reliably do.
 */
import { useEffect, useRef } from 'preact/hooks'
import { DEFAULT_LOCK_AFTER_MINUTES, isLockedByIdle } from '../lib/lockPolicy'

export function useAutoLock(
  lockAfterMinutes: number = DEFAULT_LOCK_AFTER_MINUTES,
  onLock: () => void,
): void {
  const backgroundedAt = useRef<number | null>(null)
  const onLockRef = useRef(onLock)
  onLockRef.current = onLock

  useEffect(() => {
    function onVisibility() {
      if (document.hidden) {
        backgroundedAt.current = Date.now()
        return
      }
      if (isLockedByIdle(backgroundedAt.current, Date.now(), lockAfterMinutes)) {
        onLockRef.current()
      }
      backgroundedAt.current = null
    }

    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [lockAfterMinutes])
}
```

- [ ] **Step 2: Verify and commit**

Run: `pnpm verify`
Expected: PASS.

```bash
git add src/hooks/useAutoLock.ts
git commit -m "feat(entry): lock the app after it has been away a while"
```

---

### Task 8: Install prompt hook

**Files:**
- Create: `src/hooks/useInstallPrompt.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface InstallState { canPrompt: boolean; isStandalone: boolean; isIos: boolean; prompt(): Promise<void> }`
  - `useInstallPrompt(): InstallState`

- [ ] **Step 1: Write the hook**

```ts
// src/hooks/useInstallPrompt.ts
/**
 * Install, which for an offline-first app is the difference between working
 * and not. Chromium fires `beforeinstallprompt`; iOS never does, so it gets
 * instructions instead of a button.
 */
import { useCallback, useEffect, useState } from 'preact/hooks'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export interface InstallState {
  canPrompt: boolean
  isStandalone: boolean
  isIos: boolean
  prompt(): Promise<void>
}

function detectStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari's own flag, which predates the media query.
    (navigator as { standalone?: boolean }).standalone === true
  )
}

function detectIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

export function useInstallPrompt(): InstallState {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [isStandalone, setStandalone] = useState(detectStandalone)

  useEffect(() => {
    function onBeforeInstall(event: Event) {
      event.preventDefault()
      setDeferred(event as BeforeInstallPromptEvent)
    }
    function onInstalled() {
      setDeferred(null)
      setStandalone(true)
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const prompt = useCallback(async () => {
    if (!deferred) return
    await deferred.prompt()
    await deferred.userChoice
    // The event is single-use: Chromium refuses a second prompt() on it.
    setDeferred(null)
  }, [deferred])

  return { canPrompt: deferred !== null, isStandalone, isIos: detectIos(), prompt }
}
```

- [ ] **Step 2: Verify and commit**

Run: `pnpm verify`
Expected: PASS.

```bash
git add src/hooks/useInstallPrompt.ts
git commit -m "feat(pwa): capture the install prompt and detect standalone"
```

---

### Task 9: Wizard steps backed by history

**Files:**
- Create: `src/hooks/useWizardSteps.ts`

**Interfaces:**
- Consumes: nothing (uses `window.history` directly, not `preact-iso` — the wizard renders outside the router).
- Produces:
  - `useWizardSteps<T extends string>(steps: readonly T[]): { step: T; goTo(step: T): void; back(): void }`

- [ ] **Step 1: Write the hook**

```ts
// src/hooks/useWizardSteps.ts
/**
 * Wizard step state that Android's back gesture understands.
 *
 * The entry flow shows no back arrow (spec E11), so back is swipe on iOS and
 * the system gesture on Android. With steps held in plain state, that gesture
 * leaves the app instead of stepping back -- so each step is a real history
 * entry.
 */
import { useCallback, useEffect, useState } from 'preact/hooks'

const STATE_KEY = 'polyster.wizardStep'

export function useWizardSteps<T extends string>(steps: readonly T[]) {
  const first = steps[0] as T
  const [step, setStep] = useState<T>(first)

  useEffect(() => {
    function onPopState(event: PopStateEvent) {
      const next = (event.state as Record<string, unknown> | null)?.[STATE_KEY]
      setStep(typeof next === 'string' && steps.includes(next as T) ? (next as T) : first)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [steps, first])

  const goTo = useCallback((next: T) => {
    window.history.pushState({ [STATE_KEY]: next }, '')
    setStep(next)
  }, [])

  const back = useCallback(() => {
    window.history.back()
  }, [])

  return { step, goTo, back }
}
```

- [ ] **Step 2: Verify and commit**

Run: `pnpm verify`
Expected: PASS.

```bash
git add src/hooks/useWizardSteps.ts
git commit -m "feat(entry): make wizard steps real history entries"
```

---

### Task 10: Landing screen

**Files:**
- Create: `src/screens/entry/Landing.tsx`
- Delete: `src/screens/Landing.tsx`

**Interfaces:**
- Consumes: `GlowBackdrop`, `Logomark`, `IconArrowUpRight`, `useInstallPrompt`.
- Produces: `<Landing onContinue={() => void} />`

- [ ] **Step 1: Write the screen**

```tsx
// src/screens/entry/Landing.tsx
/**
 * The first screen on a device with nothing set up.
 *
 * One door, not two: sign-in and sign-up are the same three screens, and only
 * the backend knows which one a number is (spec E9).
 */
import { GlowBackdrop } from '../../components/GlowBackdrop'
import { Logomark } from '../../components/Logomark'
import { IconArrowUpRight } from '../../components/icons'
import { useInstallPrompt } from '../../hooks/useInstallPrompt'

export function Landing({ onContinue }: { onContinue: () => void }) {
  const install = useInstallPrompt()

  return (
    <main class="relative flex min-h-svh flex-col overflow-hidden bg-stone-950 px-6 text-stone-100">
      <GlowBackdrop />

      <div class="safe-top relative z-10 flex items-center gap-2">
        <Logomark size={28} class="text-brand-400" />
        <span class="text-base font-semibold tracking-tight">Polyster</span>
      </div>

      <div class="relative z-10 mx-auto flex w-full max-w-sm flex-1 flex-col justify-center">
        <h1 class="text-balance tracking-tight">
          <span class="block text-2xl font-normal leading-tight text-stone-300">
            Take orders and payments
          </span>
          <span class="mt-1 block text-4xl font-bold leading-tight text-white">
            even with no signal.
          </span>
        </h1>
        <p class="mt-5 max-w-xs text-sm leading-relaxed text-stone-300">
          One account for the whole shop. You sign in with your phone number.
        </p>
      </div>

      <div class="safe-bottom relative z-10 mx-auto w-full max-w-sm">
        <button
          type="button"
          onClick={onContinue}
          class="flex w-full items-center justify-between gap-3 rounded-control border
                 border-white/5 bg-white/6 py-1.5 pl-5 pr-1.5 text-white backdrop-blur-xl
                 transition-transform active:scale-[0.98] active:bg-white/10"
        >
          <span class="text-base font-medium">Continue with your phone number</span>
          <span class="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand-500 text-white">
            <IconArrowUpRight size={18} />
          </span>
        </button>

        {!install.isStandalone && install.canPrompt && (
          <button
            type="button"
            onClick={() => void install.prompt()}
            class="mt-3 w-full py-2 text-center text-xs text-stone-400 active:text-stone-200"
          >
            Add to home screen
          </button>
        )}
      </div>
    </main>
  )
}
```

- [ ] **Step 2: Remove the old screen**

```bash
git rm src/screens/Landing.tsx
```

- [ ] **Step 3: Verify and commit**

Run: `pnpm verify`
Expected: FAIL — `src/app.tsx` still imports the old path. Fix the import to `./screens/entry/Landing` and pass `onContinue` where `onSignIn` was; `app.tsx` is rewritten properly in Task 13, so a minimal fix is enough here.

```bash
git add src/screens/entry/Landing.tsx src/app.tsx
git commit -m "feat(entry): one door on the landing screen, and an install chip"
```

---

### Task 11: Setup wizard — five steps and the install epilogue

**Files:**
- Create: `src/screens/entry/SetupFlow.tsx`
- Create: `src/screens/entry/steps/PhoneStep.tsx`
- Create: `src/screens/entry/steps/CodeStep.tsx`
- Create: `src/screens/entry/steps/ShopStep.tsx`
- Create: `src/screens/entry/steps/PinStep.tsx`
- Create: `src/screens/entry/steps/MeasureStep.tsx`
- Create: `src/screens/entry/InstallStep.tsx`
- Delete: `src/screens/setup/SetupFlow.tsx`

**Interfaces:**
- Consumes: `useWizardSteps`, `useAuth`, `useShop`, `useInstallPrompt`, `PinPad`, `createShop`, `createStaff`, `createMeasurementField`, `isSupabaseConfigured`, `formatPhoneForDisplay`.
- Produces: `<SetupFlow onDone={() => void} />`, and these step components, each taking exactly the props listed in its own step below.

- [ ] **Step 1: Shared shell and the stepper**

```tsx
// src/screens/entry/SetupFlow.tsx
/**
 * First run: verify a number, then build the shop.
 *
 * Verification comes first so a failed code costs no typing. The offline
 * branch skips steps 1-2 and claims the number later (spec E3).
 */
import { useState } from 'preact/hooks'
import type { ComponentChildren } from 'preact'
import { GlowBackdrop } from '../../components/GlowBackdrop'
import { useWizardSteps } from '../../hooks/useWizardSteps'
import { useAuth } from '../../hooks/useAuth'
import { useShop } from '../../state/ShopProvider'
import { isSupabaseConfigured } from '../../lib/supabaseClient'
import { PhoneStep } from './steps/PhoneStep'
import { CodeStep } from './steps/CodeStep'
import { ShopStep } from './steps/ShopStep'
import { PinStep } from './steps/PinStep'
import { MeasureStep } from './steps/MeasureStep'
import { InstallStep } from './InstallStep'
import type { ShopDoc, StaffDoc } from '../../db/schema'

const STEPS = ['phone', 'code', 'shop', 'pin', 'measure', 'install'] as const
type Step = (typeof STEPS)[number]

/** The install epilogue is not part of creating a shop, so it is not a segment. */
const COUNTED_STEPS = 5

export function SetupFlow({ onDone }: { onDone: () => void }) {
  const { state: auth } = useAuth()
  const { setActiveStaff } = useShop()
  const { step, goTo } = useWizardSteps<Step>(STEPS)

  const [phone, setPhone] = useState('')
  const [shop, setShop] = useState<ShopDoc | null>(null)
  const [owner, setOwner] = useState<StaffDoc | null>(null)

  // A build with no Supabase credentials cannot send a code, so it must not
  // offer to (spec: local_only edge case).
  const canVerify = isSupabaseConfigured()
  const alreadyVerified = auth.status === 'signed_in'
  const firstStep: Step = canVerify && !alreadyVerified ? 'phone' : 'shop'

  function finish() {
    if (owner) setActiveStaff(owner)
    onDone()
  }

  return (
    <Frame index={STEPS.indexOf(step)}>
      {step === 'phone' && (
        <PhoneStep
          onSent={(sent) => {
            setPhone(sent)
            goTo('code')
          }}
          onSkip={() => goTo('shop')}
        />
      )}
      {step === 'code' && <CodeStep phone={phone} onVerified={() => goTo('shop')} />}
      {step === 'shop' && (
        <ShopStep
          onCreated={(created) => {
            setShop(created)
            goTo('pin')
          }}
        />
      )}
      {step === 'pin' && shop && (
        <PinStep
          shopId={shop.id}
          onCreated={(created) => {
            setOwner(created)
            goTo('measure')
          }}
        />
      )}
      {step === 'measure' && shop && (
        <MeasureStep shopId={shop.id} onDone={() => goTo('install')} />
      )}
      {step === 'install' && <InstallStep onDone={finish} />}
      {/* firstStep is read once on mount by the caller; see app.tsx Task 13. */}
      {step !== firstStep && null}
    </Frame>
  )
}

function Frame({ index, children }: { index: number; children: ComponentChildren }) {
  return (
    <main class="relative flex min-h-svh flex-col overflow-hidden bg-stone-950 px-6 text-stone-100">
      <GlowBackdrop />
      <header class="safe-top relative z-10 flex justify-center pb-5 pt-4">
        <div class="flex w-26 gap-1.5" aria-label={`Step ${Math.min(index + 1, COUNTED_STEPS)} of ${COUNTED_STEPS}`}>
          {Array.from({ length: COUNTED_STEPS }, (_, i) => (
            <span
              key={i}
              class={`h-0.75 flex-1 rounded-full transition-colors ${
                i <= index ? 'bg-brand-400' : 'bg-white/16'
              }`}
            />
          ))}
        </div>
      </header>
      <div class="safe-bottom relative z-10 mx-auto flex w-full max-w-sm flex-1 flex-col pb-6">
        {children}
      </div>
    </main>
  )
}
```

- [ ] **Step 2: Phone step**

```tsx
// src/screens/entry/steps/PhoneStep.tsx
import { useState } from 'preact/hooks'
import { useAuth } from '../../../hooks/useAuth'
import { EntryHeading, EntryField, EntryInput, EntryButton, EntryError } from '../parts'

export function PhoneStep({
  onSent,
  onSkip,
}: {
  onSent: (phone: string) => void
  onSkip: () => void
}) {
  const { controller } = useAuth()
  const [phone, setPhone] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(event: Event) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await controller.requestCode(phone)
      onSent(phone)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send a code.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} class="flex flex-1 flex-col justify-center">
      <EntryHeading
        title="Your phone number"
        body="We'll send a code to check it's yours. This is how you get back in on a new phone."
      />
      <EntryField label="Phone number">
        <EntryInput
          autofocus
          type="tel"
          inputmode="tel"
          autocomplete="tel"
          placeholder="0700 000 000"
          value={phone}
          onInput={(e) => setPhone((e.target as HTMLInputElement).value)}
        />
      </EntryField>
      {error && <EntryError>{error}</EntryError>}
      <EntryButton type="submit" disabled={busy} class="mt-5">
        {busy ? 'Sending...' : 'Send code'}
      </EntryButton>
      <button
        type="button"
        onClick={onSkip}
        class="mt-4 text-center text-xs text-stone-400 active:text-stone-200"
      >
        No signal right now? <span class="font-semibold text-brand-300">Set up on this device</span>
      </button>
    </form>
  )
}
```

- [ ] **Step 3: Code step**

```tsx
// src/screens/entry/steps/CodeStep.tsx
import { useState } from 'preact/hooks'
import { PinPad } from '../../../components/PinPad'
import { useAuth } from '../../../hooks/useAuth'
import { toE164, formatPhoneForDisplay } from '../../../lib/phone'
import { EntryHeading } from '../parts'

export function CodeStep({ phone, onVerified }: { phone: string; onVerified: () => void }) {
  const { controller } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const e164 = toE164(phone)

  return (
    <div class="flex flex-1 flex-col justify-center">
      <EntryHeading
        centred
        title="Enter the code"
        body={`Sent to ${e164 ? formatPhoneForDisplay(e164) : phone}`}
      />
      <PinPad
        hint={error ?? ' '}
        errorHint="That code did not work. Ask for a new one."
        busyHint="Checking..."
        onComplete={async (code) => {
          try {
            await controller.verifyCode(phone, code)
            onVerified()
            return true
          } catch (err) {
            setError(err instanceof Error ? err.message : null)
            return false
          }
        }}
      />
    </div>
  )
}
```

- [ ] **Step 4: Shop step**

```tsx
// src/screens/entry/steps/ShopStep.tsx
import { useState } from 'preact/hooks'
import { useShop } from '../../../state/ShopProvider'
import { useAuth } from '../../../hooks/useAuth'
import { createShop } from '../../../db/writes'
import { EntryHeading, EntryField, EntryInput, EntryButton, EntryError } from '../parts'
import type { ShopDoc } from '../../../db/schema'

/** Your name is held here and used by the next step -- one screen, one act. */
export function ShopStep({ onCreated }: { onCreated: (shop: ShopDoc, yourName: string) => void }) {
  const { db } = useShop()
  const { state: auth } = useAuth()
  const [name, setName] = useState('')
  const [yourName, setYourName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function submit(event: Event) {
    event.preventDefault()
    if (!name.trim()) return setError('The shop needs a name -- clients see it in every message.')
    if (!yourName.trim()) return setError('Your name is recorded against the orders you take.')

    setSaving(true)
    setError(null)
    try {
      const created = await createShop(db, {
        name,
        supabaseAuthUserId: auth.status === 'signed_in' ? auth.userId : undefined,
      })
      onCreated(created, yourName)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.')
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} class="flex flex-1 flex-col justify-center">
      <EntryHeading
        title="Your shop"
        body="The name clients see in the messages you send them. You can change it later in Settings."
      />
      <EntryField label="Shop name">
        <EntryInput
          autofocus
          value={name}
          onInput={(e) => setName((e.target as HTMLInputElement).value)}
        />
      </EntryField>
      <EntryField label="Your name">
        <EntryInput
          value={yourName}
          onInput={(e) => setYourName((e.target as HTMLInputElement).value)}
        />
      </EntryField>
      {error && <EntryError>{error}</EntryError>}
      <EntryButton type="submit" disabled={saving} class="mt-5">
        {saving ? 'Saving...' : 'Continue'}
      </EntryButton>
    </form>
  )
}
```

**Note for the implementer:** `SetupFlow` in Step 1 calls `onCreated(created)` with one argument. Update it to `onCreated={(created, yourName) => { setShop(created); setYourName(yourName); goTo('pin') }}` and add a `yourName` state alongside `shop`, passing it to `PinStep` as a prop.

- [ ] **Step 5: PIN step**

```tsx
// src/screens/entry/steps/PinStep.tsx
import { useState } from 'preact/hooks'
import { PinPad } from '../../../components/PinPad'
import { useShop } from '../../../state/ShopProvider'
import { createStaff } from '../../../db/writes'
import { PIN_LENGTH } from '../../../lib/pin'
import { EntryHeading } from '../parts'
import type { StaffDoc } from '../../../db/schema'

export function PinStep({
  shopId,
  yourName,
  onCreated,
}: {
  shopId: string
  yourName: string
  onCreated: (staff: StaffDoc) => void
}) {
  const { db } = useShop()
  const [phase, setPhase] = useState<'choose' | 'confirm'>('choose')
  const [first, setFirst] = useState('')
  const confirming = phase === 'confirm'

  return (
    <div class="flex flex-1 flex-col justify-center">
      <EntryHeading
        centred
        title={confirming ? 'Type it again' : 'Choose a PIN'}
        body={
          confirming
            ? 'So a mistyped digit does not lock you out of your own shop.'
            : `${PIN_LENGTH} digits to open the app on this phone. It never leaves this device.`
        }
      />
      <PinPad
        key={phase}
        hint={confirming ? 'Confirm your PIN' : 'Choose your PIN'}
        errorHint="Those did not match. Start again."
        busyHint="Saving..."
        onComplete={async (pin) => {
          if (!confirming) {
            setFirst(pin)
            setPhase('confirm')
            return true
          }
          if (pin !== first) {
            setFirst('')
            setPhase('choose')
            return false
          }
          // Not signed in here: doing so unmounts the flow before the last step.
          onCreated(await createStaff(db, shopId, { name: yourName, pin, role: 'owner' }))
          return true
        }}
      />
    </div>
  )
}
```

- [ ] **Step 6: Measurement step**

Port `MeasurementStep` from `src/screens/setup/SetupFlow.tsx:349-437` into `src/screens/entry/steps/MeasureStep.tsx` unchanged in logic. Rename the component to `MeasureStep`, rename the `onFinish` prop to `onDone`, and swap the light-theme classes for the entry parts: `EntryHeading` for `StepHeading`, `EntryButton` for `Button`, and for the chips use

```tsx
class={`inline-flex min-h-10 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium
        transition-colors ${
          active
            ? 'bg-brand-600 text-white'
            : 'border border-white/11 bg-white/6 text-stone-300'
        }`}
```

Drop the `Card` wrapper and the trailing `InfoNote` — keep the "Skip for now" ghost button.

- [ ] **Step 7: Install step**

```tsx
// src/screens/entry/InstallStep.tsx
import { useInstallPrompt } from '../../hooks/useInstallPrompt'
import { EntryHeading, EntryButton } from './parts'

export function InstallStep({ onDone }: { onDone: () => void }) {
  const install = useInstallPrompt()

  // Already installed: there is nothing to ask for.
  if (install.isStandalone) {
    onDone()
    return null
  }

  return (
    <div class="flex flex-1 flex-col justify-center">
      <EntryHeading
        centred
        title="Keep it on your home screen"
        body="This is what makes it open with no internet. In a browser tab it can be lost when you close it."
      />

      {install.isIos && (
        <p class="mt-5 rounded-card border border-white/11 bg-white/5 px-4 py-3.5 text-sm leading-relaxed text-stone-300">
          Tap <span class="font-semibold text-white">Share</span> at the bottom of Safari, then{' '}
          <span class="font-semibold text-white">Add to Home Screen</span>.
        </p>
      )}

      <div class="mt-6 space-y-2">
        {install.canPrompt && (
          <EntryButton
            onClick={async () => {
              await install.prompt()
              onDone()
            }}
          >
            Add to home screen
          </EntryButton>
        )}
        <button
          type="button"
          onClick={onDone}
          class="min-h-11 w-full text-sm font-medium text-stone-400 active:text-stone-200"
        >
          {install.canPrompt ? 'Not now' : 'Continue'}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 8: The shared entry parts**

Create `src/screens/entry/parts.tsx` with the dark-shell primitives every step above imports. These are separate from `ui.tsx` because they are unthemed by design — the entry flow is always dark (spec E6).

```tsx
// src/screens/entry/parts.tsx
/** Dark-only primitives for the entry flow. Unthemed on purpose -- spec E6. */
import type { ComponentChildren, JSX } from 'preact'
import { cn } from '../../components/ui'

export function EntryHeading({
  title,
  body,
  centred = false,
}: {
  title: string
  body: string
  centred?: boolean
}) {
  return (
    <header class={cn('mb-6', centred && 'text-center')}>
      <h1 class="text-2xl font-semibold tracking-tight text-white">{title}</h1>
      <p class="mt-1.5 text-sm leading-relaxed text-stone-400">{body}</p>
    </header>
  )
}

export function EntryField({ label, children }: { label: string; children: ComponentChildren }) {
  return (
    <label class="mb-3 block">
      <span class="mb-1.5 block pl-4 text-sm font-medium text-stone-300">{label}</span>
      {children}
    </label>
  )
}

export function EntryInput({ class: className, ...props }: JSX.IntrinsicElements['input']) {
  return (
    <input
      {...props}
      class={cn(
        'min-h-11 w-full rounded-control border border-white/12 bg-white/6 px-4.5',
        'text-base text-white outline-none transition-colors placeholder:text-stone-500',
        'focus:border-brand-400 focus:ring-2 focus:ring-brand-400/25',
        className,
      )}
    />
  )
}

export function EntryButton({ class: className, ...props }: JSX.IntrinsicElements['button']) {
  return (
    <button
      {...props}
      class={cn(
        'min-h-12 w-full rounded-control bg-brand-500 px-4 text-[15px] font-semibold text-white',
        'transition-transform active:scale-[0.98] active:bg-brand-600',
        'disabled:pointer-events-none disabled:opacity-40',
        className,
      )}
    />
  )
}

export function EntryError({ children }: { children: ComponentChildren }) {
  return (
    <p role="alert" class="mt-3 rounded-control border border-red-500/30 bg-red-500/12 px-4 py-2.5 text-sm text-red-300">
      {children}
    </p>
  )
}
```

- [ ] **Step 9: Delete the old wizard**

```bash
git rm src/screens/setup/SetupFlow.tsx
```

- [ ] **Step 10: Verify and commit**

Run: `pnpm verify`
Expected: FAIL until `app.tsx` points at the new path — do the minimal import fix, since Task 13 rewrites it.

```bash
git add src/screens/entry src/app.tsx
git commit -m "feat(entry): five-step setup, verified by phone, ending at install"
```

---

### Task 12: Lock screen

**Files:**
- Create: `src/screens/entry/LockScreen.tsx`
- Delete: `src/screens/StaffGate.tsx`

**Interfaces:**
- Consumes: `useShop`, `verifyPin` from `src/lib/pin.ts`, `backoffMs` from `src/lib/lockPolicy.ts`, `getInitials` from `src/components/ui.tsx`, `PinPad`, `GlowBackdrop`.
- Produces: `<LockScreen authStatus={AuthState['status']} onForgotPin={() => void} />`

- [ ] **Step 1: Write the screen**

```tsx
// src/screens/entry/LockScreen.tsx
/**
 * One person, one pad. No list of names: showing them invites signing in as
 * someone else, and they are exactly the people attribution protects (E4).
 */
import { useRef, useState } from 'preact/hooks'
import { GlowBackdrop } from '../../components/GlowBackdrop'
import { PinPad } from '../../components/PinPad'
import { getInitials } from '../../components/ui'
import { useShop } from '../../state/ShopProvider'
import { verifyPin } from '../../lib/pin'
import { backoffMs } from '../../lib/lockPolicy'
import type { AuthState } from '../../lib/auth'

export function LockScreen({
  authStatus,
  onForgotPin,
}: {
  authStatus: AuthState['status']
  onForgotPin: () => void
}) {
  const { staff, shop, setActiveStaff } = useShop()
  const failures = useRef(0)
  const [waiting, setWaiting] = useState(false)

  // One person per device (spec consequence 1), so this is the only candidate.
  const person = staff[0]
  if (!person) return null

  return (
    <main class="relative flex min-h-svh flex-col overflow-hidden bg-stone-950 px-6">
      <GlowBackdrop />
      <div class="safe-top safe-bottom relative z-10 mx-auto flex w-full max-w-76 flex-1 flex-col justify-center">
        <div class="flex flex-col items-center text-center">
          <span
            class="flex size-14 items-center justify-center rounded-full border border-brand-400/40
                   bg-brand-500/25 text-lg font-semibold text-brand-300"
            aria-hidden="true"
          >
            {getInitials(person.name)}
          </span>
          <h1 class="mt-3 text-xl font-semibold tracking-tight text-white">{person.name}</h1>
          {shop?.name && <p class="mt-0.5 text-sm text-stone-400">{shop.name}</p>}
        </div>

        <div class="mt-7">
          <PinPad
            busyHint={waiting ? 'Too many tries. Wait a moment.' : 'Checking...'}
            onComplete={async (pin) => {
              const delay = backoffMs(failures.current)
              if (delay > 0) {
                setWaiting(true)
                await new Promise((resolve) => setTimeout(resolve, delay))
                setWaiting(false)
              }
              const ok = await verifyPin(pin, person.pin_hash)
              failures.current = ok ? 0 : failures.current + 1
              if (ok) setActiveStaff(person)
              return ok
            }}
          />
        </div>

        <button
          type="button"
          onClick={onForgotPin}
          class="mt-7 min-h-11 text-center text-sm text-stone-400 active:text-stone-200"
        >
          Forgotten your PIN?
        </button>

        {authStatus === 'offline_stale' && (
          <p class="mt-5 rounded-card border border-amber-500/30 bg-amber-500/12 px-4 py-3 text-xs leading-relaxed text-amber-300">
            Working offline -- sync is paused. Everything you record is saved here and sends when
            you are back on.
          </p>
        )}
      </div>
    </main>
  )
}
```

- [ ] **Step 2: Delete the old gate**

```bash
git rm src/screens/StaffGate.tsx
```

- [ ] **Step 3: Verify and commit**

Run: `pnpm verify`
Expected: FAIL on the `app.tsx` import — fix it minimally.

```bash
git add src/screens/entry/LockScreen.tsx src/app.tsx
git commit -m "feat(entry): a lock screen that shows one person, not a list"
```

---

### Task 13: Rewire the app root

**Files:**
- Modify: `src/app.tsx`

**Interfaces:**
- Consumes: `decideEntryScreen`, `useAutoLock`, `DEFAULT_LOCK_AFTER_MINUTES`, `Landing`, `SetupFlow`, `LockScreen`, `Shell`.
- Produces: nothing further tasks consume.

- [ ] **Step 1: Rewrite `src/app.tsx`**

```tsx
/**
 * Application root.
 *
 * The order is the point: open the database, mount ShopProvider so local data
 * is known, then decide the screen. Deciding from `auth.status` alone is what
 * made local_only and offline_stale skip the landing.
 */
import { LocationProvider } from 'preact-iso'
import { useCallback, useState } from 'preact/hooks'
import { useAuth } from './hooks/useAuth'
import { useAutoLock } from './hooks/useAutoLock'
import { useDatabase } from './hooks/useDatabase'
import { useOnline } from './hooks/useOnline'
import { useReplication } from './hooks/useReplication'
import { ShopProvider, useShop } from './state/ShopProvider'
import { Landing } from './screens/entry/Landing'
import { SetupFlow } from './screens/entry/SetupFlow'
import { LockScreen } from './screens/entry/LockScreen'
import { Shell } from './screens/Shell'
import { Logomark } from './components/Logomark'
import { decideEntryScreen } from './lib/entryState'
import { DEFAULT_LOCK_AFTER_MINUTES } from './lib/lockPolicy'
import type { AuthState } from './lib/auth'
import type { ReplicationStatus } from './hooks/useReplication'

export function App() {
  const { state: auth } = useAuth()
  const database = useDatabase()

  if (database.status === 'error') return <FatalError error={database.error} />
  if (database.status === 'loading') return <Splash />

  return (
    <ShopProvider db={database.db}>
      <LocationProvider>
        <Entry auth={auth} dbStatus="ready" />
      </LocationProvider>
    </ShopProvider>
  )
}

function Entry({ auth, dbStatus }: { auth: AuthState; dbStatus: 'ready' }) {
  const online = useOnline()
  const { shop, staff, activeStaff, setActiveStaff } = useShop()
  const replication = useReplication(null, auth.status === 'signed_in')

  const [setupFinished, setSetupFinished] = useState(false)
  const provisioned = Boolean(shop) && staff.length > 0

  const lock = useCallback(() => setActiveStaff(null), [setActiveStaff])
  useAutoLock(DEFAULT_LOCK_AFTER_MINUTES, lock)

  const screen = decideEntryScreen({
    dbStatus,
    authStatus: auth.status,
    provisioned: provisioned && setupFinished !== false ? true : provisioned,
    locked: !activeStaff,
  })

  if (screen === 'splash') return <Splash />
  if (screen === 'landing') return <LandingGate />
  if (screen === 'setup') return <SetupFlow onDone={() => setSetupFinished(true)} />
  if (screen === 'lock') {
    return <LockScreen authStatus={auth.status} onForgotPin={() => setSetupFinished(false)} />
  }
  return <Shell online={online} auth={auth} replication={replication} />
}

/** Landing is a screen, not a route: the router lives inside the shell. */
function LandingGate() {
  const [started, setStarted] = useState(false)
  if (started) return <SetupFlow onDone={() => setStarted(false)} />
  return <Landing onContinue={() => setStarted(true)} />
}

function Splash() {
  return (
    <main class="flex min-h-svh items-center justify-center bg-[#0f1e52]">
      <Logomark size={44} class="animate-pulse text-brand-300" />
    </main>
  )
}

function FatalError({ error }: { error: Error }) {
  return (
    <main class="flex min-h-svh items-center justify-center bg-stone-950 px-6 text-stone-100">
      <div class="max-w-md space-y-3 text-center">
        <h1 class="text-xl font-semibold">The local database did not open</h1>
        <p class="text-sm text-stone-400">
          Nothing has been lost, but this device cannot record work until it does. Reloading the
          app is worth trying first.
        </p>
        <pre class="overflow-x-auto rounded-control bg-black p-3 text-left text-xs text-stone-100">
          {error.message}
        </pre>
      </div>
    </main>
  )
}
```

**Note for the implementer:** the `provisioned` expression above is deliberately written out because `setupFinished` must latch the wizard open — creating the owner makes `provisioned` true and would otherwise tear the wizard down before the install step. Simplify it to a plain `const showSetup = !provisioned || (started && !setupFinished)` if that reads better, but **keep the latch**: the old code documented this exact bug at `src/screens/setup/SetupFlow.tsx:36-42`.

Also restore the real replication argument — `useReplication(database.db, ...)` — by passing `db` down from `App` rather than the `null` placeholder above.

- [ ] **Step 2: Verify**

Run: `pnpm verify`
Expected: PASS.

- [ ] **Step 3: Drive it manually**

Run: `pnpm dev` with no `.env` present, at phone dimensions in a browser.
Expected: branded splash → landing → "Continue with your phone number" → **shop step directly** (no phone step, because `isSupabaseConfigured()` is false) → PIN → measurements → install → dashboard. Reload: lock screen with one name.

- [ ] **Step 4: Commit**

```bash
git add src/app.tsx
git commit -m "feat(entry): decide the entry screen from local data"
```

---

### Task 14: Sign-out wipes the device, and staff creation goes dark

**Files:**
- Modify: `src/screens/Settings.tsx:108-121`
- Modify: `src/screens/settings/StaffSettings.tsx`
- Modify: `src/db/database.ts` (add a remove helper)

**Interfaces:**
- Consumes: `AppDatabase` from `src/db/database.ts`.
- Produces: `wipeLocalDatabase(db: AppDatabase): Promise<void>` from `src/db/database.ts`.

- [ ] **Step 1: Add the wipe helper**

In `src/db/database.ts`:

```ts
/**
 * Destroys every local collection. Sign-out only -- a shop's local copy is the
 * only copy until it syncs. Spec E14, flagged there as provisional.
 */
export async function wipeLocalDatabase(db: AppDatabase): Promise<void> {
  await db.remove()
}
```

- [ ] **Step 2: Rewrite the sign-out section of `Settings.tsx`**

Replace the `Shop account` section's contents with a two-tap confirmation:

```tsx
        <section>
          <SectionTitle>Shop account</SectionTitle>
          <Card>
            {confirmingSignOut ? (
              <>
                <p class="text-sm text-stone-600 dark:text-stone-300">
                  This removes the shop and everything recorded on this device. Anything not yet
                  synced is lost. Export a backup first if you are unsure.
                </p>
                <Button
                  variant="danger"
                  block
                  class="mt-3"
                  onClick={async () => {
                    await controller.signOut()
                    await wipeLocalDatabase(db)
                    window.location.reload()
                  }}
                >
                  Yes, remove this shop
                </Button>
                <Button
                  variant="ghost"
                  block
                  class="mt-2"
                  onClick={() => setConfirmingSignOut(false)}
                >
                  Cancel
                </Button>
              </>
            ) : (
              <Button variant="danger" block onClick={() => setConfirmingSignOut(true)}>
                Sign out and remove this shop from this device
              </Button>
            )}
          </Card>
        </section>
```

Add `const [confirmingSignOut, setConfirmingSignOut] = useState(false)` and pull `db` from `useShop()`.

- [ ] **Step 3: Take the create-staff path out of `StaffSettings`**

A staff member now signs in on their own handset with their own number, which is the deferred multi-user model (spec, Consequences 1). Replace the add-staff form and its trigger with an `EmptyState`-style note, keeping the existing list, rename and deactivate controls untouched:

```tsx
        <InfoNote>
          Staff each sign in on their own phone with their own number. Inviting them is not built
          yet -- until it is, this shop has one person on it.
        </InfoNote>
```

Delete the now-unused sheet, its form state, and the `createStaff` import from this file. `createStaff` itself stays in `writes.ts` — `PinStep` uses it.

- [ ] **Step 4: Verify and commit**

Run: `pnpm verify`
Expected: PASS.

```bash
git add src/db/database.ts src/screens/Settings.tsx src/screens/settings/StaffSettings.tsx
git commit -m "feat(settings): sign out removes the shop from the device"
```

---

### Task 15: Documentation

**Files:**
- Modify: `docs/ARCHITECTURE.md`
- Modify: `README.md`

- [ ] **Step 1: Record the decisions**

Add to the decision table in `docs/ARCHITECTURE.md` section 6:

- **D15 — Credential.** Phone number plus a one-time code, replacing email and password. Rejected: email/password (D4's original). The audience authenticates by phone and short code daily through mobile money; the code screen and the PIN screen become one component. Requires an SMS or WhatsApp provider configured in Supabase — a running per-message cost, in a project that chose Cloudflare to avoid surprise bills (D3).
- **D16 — Entry decision.** Derived from local data (`shop` + `staff` present), with auth secondary. Rejected: deriving from `auth.status`, which made `local_only` and `offline_stale` skip the landing entirely.
- **D17 — Device lock.** PIN on lapse plus a configurable idle timeout, default 5 minutes. The lock screen shows one person and never a list.
- **D18 — Sign-out.** Clears the session and wipes the local database. Provisional; see the spec's open items.

- [ ] **Step 2: Update section 7's auth table**

The four states are unchanged, but `signed_out` no longer means "login screen" — it means the landing screen on an unprovisioned device, and the lock screen on a provisioned one. Correct that row.

- [ ] **Step 3: Update section 11's known limitations**

Add: a shop has exactly one person on it until the multi-user model lands; staff invitation is not built; the WhatsApp number is no longer collected during setup; OTP delivery has never been exercised against a real provider.

- [ ] **Step 4: Update `README.md`**

Replace the "Create shop accounts" section — accounts are no longer made by hand in the dashboard. Document instead: configure a phone provider under Authentication → Providers → Phone, set `VITE_CODE_CHANNEL`, and note that without a provider the app still runs fully local-only, which is the supported way to develop UI.

- [ ] **Step 5: Commit**

```bash
git add docs/ARCHITECTURE.md README.md
git commit -m "docs: record the phone-first entry decisions"
```

---

## Self-review

**Spec coverage.** E1 → Tasks 2, 5, 11. E2 → Task 5 (`VITE_CODE_CHANNEL`). E3 → Task 11 (`onSkip`). E4 → Task 12. E5 → Tasks 3, 7. E6 → Tasks 11, 12 (`parts.tsx`). E7 → Tasks 4, 13. E8 → Tasks 8, 10, 11. E9 → Task 10. E10 → Task 1. E11 → Task 9. E12 → Task 1. E13 → Task 6. E14 → Task 14. Findings F1–F14 all land in a task except **F11 (the missing value claims), which the spec explicitly leaves unresolved** — no task, by design.

**Two gaps I could not close in this plan, listed rather than papered over:**

1. **"Forgotten your PIN?" has a button but no destination.** Task 12 wires `onForgotPin` to reset the setup latch, which is not a real recovery flow — proper recovery is re-verify the number, then set a new PIN, and that needs a screen this plan does not build. It should be its own task before this ships.
2. **`shop.lock_after_minutes` is specified but never persisted.** Task 7 uses `DEFAULT_LOCK_AFTER_MINUTES` directly. Making it configurable needs a schema change (`shopSchema` is already at `version: 1`, so it needs a migration strategy) plus a Settings control. Deferred deliberately; the default is what ships.

**Placeholder scan.** No TBD/TODO. Two steps carry "Note for the implementer" blocks (Tasks 11 and 13) where the code as written needs a named adjustment — those state exactly what to change and why, rather than deferring a decision.

**Type consistency.** `AuthDeps.signInWithOtp(e164, channel)` matches its test assertions. `decideEntryScreen`'s `EntryInput` matches Task 13's call site. `PinPad`'s props are unchanged apart from the `tone` default. `EntryButton`/`EntryInput`/`EntryField`/`EntryHeading`/`EntryError` are defined in Task 11 Step 8 and used by every step in that task — note that Step 8 comes *after* the steps that import it, so the implementer should create `parts.tsx` first.
