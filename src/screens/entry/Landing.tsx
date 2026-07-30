/**
 * The first screen on a device with nothing set up.
 *
 * One door, not two: signing in and signing up are the same three screens --
 * phone, code, PIN -- and only the backend knows which one a number is, so
 * there is nothing for the user to declare (spec E9).
 *
 * Always dark, regardless of the system's light/dark setting. Everything
 * before the shell is one fixed, branded world.
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

      {/* safe-top sets padding itself, so the design spacing goes on the child. */}
      <div class="safe-top relative z-10">
        <div class="flex items-center gap-2 pt-7">
          <Logomark size={28} class="text-brand-400" />
          <span class="text-base font-semibold tracking-tight">Polyster</span>
        </div>
      </div>

      {/*
        A deliberately narrow measure. The hero wraps to four short lines and
        fills the screen, rather than sitting as two long ones in a lot of
        empty space.
      */}
      <div class="relative z-10 mx-auto flex w-full max-w-sm flex-1 flex-col justify-center">
        {/* An absolute width, not `ch`: ch resolves against the inherited font
            size, not the display size these lines are actually set in. */}
        <h1 class="max-w-[272px] tracking-tight">
          <span class="block text-[30px] font-normal leading-[1.14] text-stone-400">
            Take orders and payments
          </span>
          <span class="mt-2.5 block text-[44px] font-bold leading-[1.06] text-white">
            even with no signal.
          </span>
        </h1>
        <p class="mt-7 max-w-[280px] text-[15px] leading-relaxed text-stone-400">
          One account for the whole shop. You sign in with your phone number.
        </p>
      </div>

      <div class="safe-bottom relative z-10">
        <div class="mx-auto w-full max-w-sm pb-9">
          {/*
            A plain button, not the shared Button component: glass shell with a
            solid brand disc, which is the one saturated element on the screen.
          */}
          <button
            type="button"
            onClick={onContinue}
            class="glass glass-sheen flex w-full items-center justify-between gap-3 overflow-hidden
                   rounded-control py-1.5 pl-5 pr-1.5 text-white transition-transform
                   active:scale-[0.98]"
          >
            <span class="relative z-10 text-base font-medium">Continue with your number</span>
            <span class="relative z-10 flex size-11 shrink-0 items-center justify-center rounded-full bg-brand-500 text-white">
              <IconArrowUpRight size={18} />
            </span>
          </button>

          {!install.isStandalone && install.canPrompt && (
            <button
              type="button"
              onClick={() => void install.prompt()}
              class="mt-3 min-h-11 w-full text-center text-xs text-stone-400 active:text-stone-200"
            >
              Add to home screen
            </button>
          )}
        </div>
      </div>
    </main>
  )
}
