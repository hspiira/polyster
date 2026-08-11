/**
 * The first screen on a device with nothing set up.
 *
 * One door, not two: signing in and signing up are the same three screens --
 * phone, code, PIN -- and only the backend knows which one a number is, so
 * there is nothing for the user to declare (spec E9).
 *
 * Always dark, regardless of the system's light/dark setting. Everything
 * before the shell is one fixed, branded world.
 *
 * ## One screen at every size
 *
 * The shell is two designs, phone and web (spec W1); the entry flow
 * deliberately is not -- see app.tsx. So this screen has to hold on its own
 * from 375px to a desk monitor, and measured on the build before this change it
 * did not: at 1440x900 the hero was still a 272px column set in 30/44px type,
 * with its button 250px below the sentence on the bottom edge of the window.
 * A phone-sized note in the middle of a monitor.
 *
 * Two things carry the adaptation.
 *
 * **The statement scales as a poster.** Sizes are `clamp()`, and each line's
 * measure is set in `em` -- so the wrap points are identical at every size and
 * only the size changes. The clamps track `vmin` rather than `vw` because a
 * hero that grows with width alone overflows a short landscape window; keyed to
 * the smaller axis, the composition can always fit the screen it is on.
 *
 * **The action moves rather than stretches.** Stacked, it is a full-width pill
 * on the bottom edge, where a thumb is. Side by side (`entry-wide`, defined in
 * index.css) it sits beside the statement with its bottom on the statement's
 * last line, because at that size the bottom edge is nowhere near what you just
 * read.
 */
import { GlowBackdrop } from '../../components/GlowBackdrop'
import { Logomark } from '../../components/Logomark'
import { IconArrowUpRight } from '../../components/icons'
import { useInstallPrompt } from '../../hooks/useInstallPrompt'

export function Landing({ onContinue }: { onContinue: () => void }) {
  const install = useInstallPrompt()

  return (
    <main
      class="relative flex min-h-svh flex-col overflow-hidden bg-stone-950
             px-[clamp(1.5rem,1.1rem+1.6vw,3rem)] text-stone-100"
    >
      <GlowBackdrop />

      {/*
        safe-top and safe-bottom set padding themselves, so a `pt-*` here would
        be silently overridden -- the design spacing goes on the children.

        One wrapper for both rows, so the mark, the statement and the action all
        measure from the same left edge instead of from two containers that can
        disagree.
      */}
      <div
        class="safe-top safe-bottom relative z-10 mx-auto flex w-full max-w-[28rem] flex-1 flex-col
               entry-wide:max-w-[60rem]"
      >
        <header class="flex items-center gap-2 pt-[clamp(1.75rem,1.6rem+0.4vmin,2.25rem)]">
          <Logomark size={28} class="text-brand-400" />
          <span class="text-base font-semibold tracking-tight">Polyster</span>
        </header>

        {/*
          `content-center` is load-bearing once this is a grid: the single
          implicit row would otherwise stretch to the full height and `items-end`
          would drop the whole composition onto the bottom edge, which is the
          layout this is replacing.
        */}
        <div
          class="flex flex-1 flex-col pb-[clamp(2.25rem,2.05rem+0.55vmin,3rem)]
                 entry-wide:grid entry-wide:grid-cols-[minmax(0,1fr)_auto] entry-wide:content-center
                 entry-wide:items-end entry-wide:gap-x-[clamp(2rem,4vw,4.5rem)]"
        >
          {/*
            The padding is a floor, not spacing: symmetric, so it does not move
            the centred block, and it stops the statement touching the mark or
            the button when the window is short. Dropped side by side, where the
            action's bottom edge should meet the sentence's last line.
          */}
          <div class="flex flex-1 flex-col justify-center py-8 entry-wide:py-0">
            <h1 class="tracking-tight">
              {/* Measures in `em` so each line breaks in the same place at every
                  size. Not `ch`: it resolves against the inherited font size,
                  not the display size these lines are actually set in. */}
              <span
                class="block max-w-[9.1em] text-[clamp(1.875rem,1.1625rem+3.05vmin,3.25rem)]
                       font-normal leading-[1.14] text-stone-400"
              >
                Take orders and payments
              </span>
              <span
                class="mt-[0.22em] block max-w-[6.2em]
                       text-[clamp(2.75rem,1.5rem+5.33vmin,5rem)] font-bold leading-[1.06]
                       text-white"
              >
                even with no signal.
              </span>
            </h1>
            <p
              class="mt-[clamp(1.75rem,1.215rem+2.286vmin,2.5rem)] max-w-[18.7em]
                     text-[clamp(0.9375rem,0.848rem+0.381vmin,1.0625rem)] leading-relaxed
                     text-stone-400"
            >
              One account for the whole shop. You sign in with your phone number.
            </p>
          </div>

          <div class="shrink-0">
            {/*
              A plain button, not the shared Button component: glass shell with a
              solid brand disc, which is the one saturated element on the screen.

              Hover brightens the rim and the disc. Tailwind's `hover:` is
              already behind `(hover: hover)`, so a touch device does not keep
              the state after a tap.
            */}
            <button
              type="button"
              onClick={onContinue}
              class="glass glass-sheen group flex w-full items-center justify-between gap-3
                     overflow-hidden rounded-control py-1.5 pl-5 pr-1.5 text-white
                     transition-[transform,border-color] hover:border-white/24
                     active:scale-[0.98] entry-wide:w-auto entry-wide:min-w-[19rem]"
            >
              <span class="relative z-10 text-base font-medium">Continue with your number</span>
              <span
                class="relative z-10 flex size-11 shrink-0 items-center justify-center rounded-full
                       bg-brand-500 text-white transition-colors group-hover:bg-brand-400"
              >
                <IconArrowUpRight size={18} />
              </span>
            </button>

            {!install.isStandalone && install.canPrompt && (
              <button
                type="button"
                onClick={() => void install.prompt()}
                class="mt-3 min-h-11 w-full text-center text-xs text-stone-400
                       hover:text-stone-200 active:text-stone-200"
              >
                Add to home screen
              </button>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
