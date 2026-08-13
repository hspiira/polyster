/* First screen on a device with nothing set up. The hero scales like a poster:
   clamps measured in `em` and tracking `vmin`, so the lines always wrap alike. */
import { GlowBackdrop } from '../../components/GlowBackdrop'
import { Logomark } from '../../components/Logomark'
import { IconArrowUpRight } from '../../components/icons'
import { useInstallPrompt } from '../../hooks/useInstallPrompt'

export function Landing({
  onStart,
  onSignIn,
}: {
  onStart: () => void
  /** Absent when the build has no Supabase credentials -- there is nothing to sign in to. */
  onSignIn?: () => void
}) {
  const install = useInstallPrompt()

  return (
    <main
      data-theme="dark"
      class="relative flex min-h-svh flex-col overflow-hidden bg-page
             px-[clamp(1.5rem,1.1rem+1.6vw,3rem)] text-content"
    >
      <GlowBackdrop />

      {/* safe-top and safe-bottom set their own padding, so spacing goes on the
          children. One wrapper for both rows, so everything shares a left edge. */}
      <div
        class="safe-top safe-bottom relative z-10 mx-auto flex w-full max-w-md flex-1 flex-col
               entry-wide:max-w-240"
      >
        <header class="flex items-center gap-2 pt-[clamp(1.75rem,1.6rem+0.4vmin,2.25rem)]">
          <Logomark size={28} class="text-brand-400" />
          <span class="text-base font-semibold tracking-tight">Polyster</span>
        </header>

        {/* `content-center` matters once this is a grid: without it the single row
            stretches full height and `items-end` drops everything to the bottom. */}
        <div
          class="flex flex-1 flex-col pb-[clamp(2.25rem,2.05rem+0.55vmin,3rem)]
                 entry-wide:grid entry-wide:grid-cols-[minmax(0,1fr)_auto] entry-wide:content-center
                 entry-wide:items-end entry-wide:gap-x-[clamp(2rem,4vw,4.5rem)]"
        >
          {/* Symmetric padding, so it keeps the block centred while stopping the
              text touching the mark or the button in a short window. */}
          <div class="flex flex-1 flex-col justify-center py-8 entry-wide:py-0">
            <h1 class="tracking-tight">
              {/* `em`, not `ch`: `ch` resolves against the inherited font size,
                  not the display size these lines are set in. */}
              <span
                class="block max-w-[9.1em] text-[clamp(1.875rem,1.1625rem+3.05vmin,3.25rem)]
                       font-normal leading-[1.14] text-content-muted"
              >
                Take orders and payments
              </span>
              <span
                class="mt-[0.22em] block max-w-[6.2em]
                       text-[clamp(2.75rem,1.5rem+5.33vmin,5rem)] font-bold leading-[1.06]
                       text-content"
              >
                even with no signal.
              </span>
            </h1>
            <p
              class="mt-[clamp(1.75rem,1.215rem+2.286vmin,2.5rem)] max-w-[18.7em]
                     text-[clamp(0.9375rem,0.848rem+0.381vmin,1.0625rem)] leading-relaxed
                     text-content-muted"
            >
              Set up in one screen. No account, no code, nothing to remember.
            </p>
          </div>

          <div class="shrink-0">
            {/* Not the shared Button: glass shell with a solid brand disc, the one
                saturated thing on the screen. */}
            <button
              type="button"
              onClick={onStart}
              class="glass glass-sheen group flex w-full items-center justify-between gap-3
                     overflow-hidden rounded-pill py-1.5 pl-5 pr-1.5 text-content
                     transition-[transform,border-color] hover:border-glass-edge
                     active:scale-[0.98] entry-wide:w-auto entry-wide:min-w-76"
            >
              <span class="relative z-10 text-base font-medium">Set up my shop</span>
              <span
                class="relative z-10 flex size-11 shrink-0 items-center justify-center rounded-full
                       bg-brand-500 text-content transition-colors group-hover:bg-brand-400"
              >
                <IconArrowUpRight size={18} />
              </span>
            </button>

            {/* The minority case, and the only one that needs a number. */}
            {onSignIn && (
              <button
                type="button"
                onClick={onSignIn}
                class="mt-3 min-h-11 w-full text-center text-sm text-content-muted
                       hover:text-content active:text-content"
              >
                I already have a shop
              </button>
            )}

            {!install.isStandalone && install.canPrompt && (
              <button
                type="button"
                onClick={() => void install.prompt()}
                class="mt-1 min-h-11 w-full text-center text-xs text-content-subtle
                       hover:text-content-muted active:text-content-muted"
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
