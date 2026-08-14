/* The page frame: sticky heading, scrolling body, one shared measure. The one
   `lg:` is deliberate -- which navigation shows really is a viewport question. */
import type { ComponentChildren } from 'preact'
import { useLocation } from 'preact-iso'
import { IconChevronLeft } from '../components/icons'
import { useSwipeBack } from '../hooks/useSwipeBack'
import { cn } from '../lib/cn'

/* `prose` caps a comfortable reading line (the default), `wide` is for tables
   and records, `full` opts out for a screen laying out its own panes. */
export type ScreenWidth = 'prose' | 'wide' | 'full'

const WIDTHS: Record<ScreenWidth, string> = {
  prose: 'mx-auto w-full max-w-measure',
  wide: 'mx-auto w-full max-w-wide',
  full: 'w-full',
}

/** The shared measure, for chrome that has to line up with a Screen's content. */
export const MEASURE = WIDTHS.prose
export const MEASURE_WIDE = WIDTHS.wide

/* Exactly one of `title` or `label`. No subtitle: a count under the heading
   pushes content down by a data-dependent amount, so no two screens align. */
type Heading =
  | {
      /** Visible page heading, for pushed screens. */
      title: string
      label?: never
    }
  | {
      /* The accessible name for a tab root, which shows no heading: the active
         tab already says it. The h1 still needs a name, just not a visible one. */
      label: string
      title?: never
    }

/* An area's sibling screens as the heading itself: the open one is the h1, the
   rest are links beside it. A title plus pills would say it twice. */
export interface ScreenSection {
  href: string
  label: string
}

export function Screen({
  title,
  label,
  back,
  action,
  sections,
  subheader,
  width = 'prose',
  wide,
  children,
}: Heading & {
  /* Renders the area's screens as the heading. `label` names the nav region;
     the open section supplies the visible h1. */
  sections?: readonly ScreenSection[]
  /* Href for the back chevron and the edge swipe. Both, because an installed
     PWA has no browser chrome and no system back swipe. */
  back?: string
  action?: ComponentChildren
  /* Sticky content below the heading row, so it stays put while children
     scroll rather than each screen re-implementing stickiness. */
  subheader?: ComponentChildren
  width?: ScreenWidth
  /** @deprecated Use `width="wide"`. Delete once no screen passes it. */
  wide?: boolean
  children: ComponentChildren
}) {
  const swipeRef = useSwipeBack(back)
  const measure = WIDTHS[wide ? 'wide' : width]
  const heading = title ?? label
  const { path } = useLocation()

  // A label-only tab root renders nothing visible in this row, so collapse its
  // padding. A subheader still counts, and keeps the top clearance.
  const rowHasContent = Boolean(back || title || action || sections)

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
          {/* The strip spreads across the row rather than packing against the
              left: the sections are this screen's chrome, not a control sitting
              in the corner of it. */}
          {sections ? (
            <nav
              aria-label={label}
              class="flex min-w-0 flex-1 items-baseline justify-between gap-2"
            >
              {sections.map((section) => {
                const current = section.href === path
                return current ? (
                  <h1 key={section.href} class="text-[17px] font-semibold tracking-tight">
                    {section.label}
                  </h1>
                ) : (
                  <a
                    key={section.href}
                    href={section.href}
                    class="text-[17px] font-medium tracking-tight text-content-subtle
                           transition-colors hover:text-content"
                  >
                    {section.label}
                  </a>
                )
              })}
            </nav>
          ) : (
            <div class="min-w-0 flex-1">
              <h1 class={cn('truncate text-title font-semibold', !title && 'sr-only')}>
                {heading}
              </h1>
            </div>
          )}
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

/* Vertical rhythm between sections. Named rather than `space-y-4` per screen,
   so the spacing is one decision instead of a number each screen picked. */
export function Sections({ children }: { children: ComponentChildren }) {
  return <div class="flex flex-col gap-section">{children}</div>
}
