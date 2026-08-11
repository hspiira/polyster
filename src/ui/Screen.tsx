/**
 * The page frame: sticky heading, scrolling body, one shared measure.
 *
 * Width is fluid, not stepped -- `--gutter` grows with the viewport and the
 * measure is a cap. The one `lg:` below is deliberate: which navigation is on
 * screen (floating tab bar vs. side rail) genuinely is a viewport question.
 */
import type { ComponentChildren } from 'preact'
import { IconChevronLeft } from '../components/icons'
import { useSwipeBack } from '../hooks/useSwipeBack'
import { cn } from '../lib/cn'

/**
 * `prose` caps where a line of text stops being comfortable to read -- the
 * default. `wide` is for tables and multi-column records, which have no such
 * limit. `full` opts out, for a screen laying out its own panes.
 */
export type ScreenWidth = 'prose' | 'wide' | 'full'

const WIDTHS: Record<ScreenWidth, string> = {
  prose: 'mx-auto w-full max-w-measure',
  wide: 'mx-auto w-full max-w-wide',
  full: 'w-full',
}

/** The shared measure, for chrome that has to line up with a Screen's content. */
export const MEASURE = WIDTHS.prose
export const MEASURE_WIDE = WIDTHS.wide

/**
 * Exactly one of `title` or `label` is required -- never both omitted, which
 * used to compile and render no `h1` at all. `subtitle` rides along with
 * `title` only: it modifies a visible heading, and an orphaned subtitle over a
 * `label`-only tab root (which shows no heading) has nothing to modify.
 */
type Heading =
  | {
      /** Visible page heading, for pushed screens. */
      title: string
      /** A muted line under `title`. Only makes sense once there is a title. */
      subtitle?: string
      label?: never
    }
  | {
      /**
       * The accessible name for a tab root, which renders no visible heading --
       * the active tab already carries that label once, so a title on screen
       * would say it again. The `h1` still needs a name for screen readers and
       * the document outline, just not one anyone sees.
       */
      label: string
      title?: never
      subtitle?: never
    }

export function Screen({
  title,
  label,
  subtitle,
  back,
  action,
  subheader,
  width = 'prose',
  wide,
  children,
}: Heading & {
  /**
   * Href for the back chevron and the edge-swipe gesture. Omit on tab roots.
   *
   * Both, not just the chevron: in an installed PWA there is no browser chrome
   * and no system back swipe -- see hooks/useSwipeBack.ts.
   */
  back?: string
  action?: ComponentChildren
  /**
   * Sticky content below the heading row -- a filter switch, a scope bar --
   * so it stays put while `children` scrolls, rather than each screen
   * re-implementing stickiness.
   */
  subheader?: ComponentChildren
  width?: ScreenWidth
  /**
   * @deprecated Use `width="wide"`. Accepted so screens can be converted one at
   * a time; delete once none pass it.
   */
  wide?: boolean
  children: ComponentChildren
}) {
  const swipeRef = useSwipeBack(back)
  const measure = WIDTHS[wide ? 'wide' : width]
  const heading = title ?? label

  // A label-only tab root with no back chevron and no action renders nothing
  // visible in this row (the h1 is sr-only) -- collapse its padding instead of
  // reserving sticky space for nothing. A subheader still counts as something
  // to show, so the row keeps its top clearance for it.
  const rowHasContent = Boolean(back || title || action)

  return (
    <div ref={swipeRef}>
      {/*
        Page-coloured and unbordered rather than a floating bar, so a surface
        scrolling under it disappears behind the page instead of behind a
        second stacked bar with a hairline between them.
      */}
      <header class="sticky top-0 z-20 bg-page">
        <div
          class={cn(
            measure,
            'flex items-center gap-2 px-gutter',
            rowHasContent ? 'pt-1 pb-3' : subheader ? 'pt-1' : 'py-0',
          )}
        >
          {back && (
            <a
              href={back}
              aria-label="Back"
              class="-ml-2.5 flex size-10 shrink-0 items-center justify-center rounded-full
                     text-content-muted transition-colors hover:bg-hover active:bg-pressed"
            >
              <IconChevronLeft size={22} />
            </a>
          )}
          <div class="min-w-0 flex-1">
            <h1 class={cn('truncate text-title font-semibold', !title && 'sr-only')}>
              {heading}
            </h1>
            {subtitle && <p class="mt-0.5 truncate text-xs text-content-muted">{subtitle}</p>}
          </div>
          {action}
        </div>
        {subheader && <div class={cn(measure, 'px-gutter pb-3')}>{subheader}</div>}
      </header>

      {/* Clears the floating tab bar, which only exists below `lg` -- above it
          the side rail takes over and the padding would be dead space. */}
      <div class={cn(measure, 'px-gutter pb-[calc(6rem+env(safe-area-inset-bottom))] lg:pb-10')}>
        {children}
      </div>
    </div>
  )
}

/**
 * Vertical rhythm between the sections of a screen.
 *
 * A named component rather than `space-y-4` repeated on every screen, so the
 * spacing between sections is one decision (`--gap-section`, fluid) instead of
 * a number each screen happens to have picked.
 */
export function Sections({ children }: { children: ComponentChildren }) {
  return <div class="flex flex-col gap-section">{children}</div>
}
