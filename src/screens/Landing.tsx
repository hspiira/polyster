/**
 * The first screen anyone sees on a device that has never signed in.
 *
 * Its job is small and specific: make a strong first impression and get out
 * of the way. It is not a marketing page -- nobody arrives here by browsing.
 * They arrive because someone handed them a phone and said "use this now".
 *
 * One hero statement, one button. The three claims that used to live here
 * (works offline, balances are calculated, WhatsApp in one tap) moved to a
 * permanent "How this works" entry in Settings instead -- not implemented in
 * this pass. Worth naming plainly: a first-time owner who taps straight
 * through to sign-in no longer sees those claims before they are inside the
 * app, which is a real change from the old "explain before you sign in"
 * behaviour, traded for a cleaner hero.
 *
 * Always dark, regardless of the system's own light/dark setting -- unlike
 * the rest of the app, which follows `prefers-color-scheme`. This and the PIN
 * gate (StaffGate.tsx) are the two deliberate exceptions: a fixed, branded
 * moment rather than a themed one.
 */
import { GlowBackdrop } from '../components/GlowBackdrop'
import { Logomark } from '../components/Logomark'
import { IconArrowUpRight } from '../components/icons'

export function Landing({ onSignIn }: { onSignIn: () => void }) {
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
          One account for the whole shop. Staff pick their own name and PIN after signing in.
        </p>
      </div>

      <div class="safe-bottom relative z-10 mx-auto w-full max-w-sm">
        {/*
          A plain button, not the shared Button component: this is a
          one-off glass treatment specific to this screen, and Button's
          variants bake in their own background/text colour with nothing to
          override them cleanly (ui.tsx has no cn()/tailwind-merge -- see
          ARCHITECTURE.md and the design notes for this screen).
        */}
        <button
          type="button"
          onClick={onSignIn}
          class="flex w-full items-center justify-between gap-3 rounded-control border
                 border-white/5 bg-white/6 py-1.5 pl-5 pr-1.5 text-white backdrop-blur-xl
                 transition-transform active:scale-[0.98] active:bg-white/10"
        >
          <span class="text-base font-medium">Sign in</span>
          <span class="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand-500 text-white">
            <IconArrowUpRight size={18} />
          </span>
        </button>
      </div>
    </main>
  )
}
