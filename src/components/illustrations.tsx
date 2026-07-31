/**
 * Empty-state illustrations.
 *
 * Hand-rolled for the same reason as `icons.tsx` (ARCHITECTURE.md section 8):
 * this app runs on cheap phones over metered data, so bundle size is a design
 * constraint, not an afterthought. A stock illustration set would cost tens to
 * hundreds of kilobytes for artwork used on maybe a dozen screens; these are a
 * few hundred bytes each because they share one viewBox, one stroke, and one
 * accent colour with everything else in the app.
 *
 * Same stroke language as `icons.tsx` -- `currentColor`, rounded caps and
 * joins, no fills except one brand accent per piece -- just drawn at a larger
 * viewBox so the linework reads as artwork rather than a blown-up glyph. Only
 * four subjects exist because most empty states are the same kind of "nothing
 * here yet" -- reuse costs nothing and a fifth drawing would only earn its
 * bytes if it said something the other four don't.
 */
import type { JSX } from 'preact'

type IllustrationProps = JSX.SVGAttributes<SVGSVGElement> & { size?: number }

/** The one filled shape each illustration is allowed -- everything else is a
 *  stroke in `currentColor`, so no illustration needs a dark-mode palette. */
const ACCENT = 'fill-brand-600 dark:fill-brand-400'

function Illustration({ size = 96, children, ...props }: IllustrationProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 80 80"
      fill="none"
      stroke="currentColor"
      stroke-width="4"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  )
}

/** A shirt on a hanger, for empty order lists -- nothing has been made yet. */
export const IllustrationOrders = (p: IllustrationProps) => (
  <Illustration {...p}>
    <path d="M10 20h60" />
    <path d="M40 20v-3a3 3 0 1 1 3 3" />
    <path d="M22 28l18-8 18 8-5 9H27Z" />
    <path d="M27 37v24a3 3 0 0 0 3 3h20a3 3 0 0 0 3-3V37" />
    <circle cx="40" cy="50" r="2.6" class={ACCENT} stroke="none" />
  </Illustration>
)

/** A coiled tape measure, for empty measurement lists. */
export const IllustrationMeasure = (p: IllustrationProps) => (
  <Illustration {...p}>
    <path d="M12 52a26 26 0 1 1 26 26" />
    <path d="M20 52a18 18 0 1 1 18 18" />
    <path d="M22 46l4-4M30 40l4-3M40 36l4-2" />
    <rect x="6" y="46" width="10" height="16" rx="2.5" class={ACCENT} stroke="none" />
  </Illustration>
)

/** An open ledger, for empty client and staff lists -- this shop's book of names. */
export const IllustrationBook = (p: IllustrationProps) => (
  <Illustration {...p}>
    <path d="M14 18a4 4 0 0 1 4-4h20v52H18a4 4 0 0 1-4-4Z" />
    <path d="M66 18a4 4 0 0 0-4-4H42v52h20a4 4 0 0 0 4-4Z" />
    <path d="M42 14v52" />
    <path d="M20 26h12M20 34h8M48 26h12M48 34h8" />
    <path d="M56 14v14l-4-3-4 3V14Z" class={ACCENT} stroke="none" />
  </Illustration>
)

/** A magnifying glass over nothing, for records and searches that come up empty. */
export const IllustrationSearch = (p: IllustrationProps) => (
  <Illustration {...p}>
    <circle cx="33" cy="33" r="19" />
    <path d="M47 47 66 66" />
    <path d="M25 33h16" />
    <circle cx="66" cy="66" r="4" class={ACCENT} stroke="none" />
  </Illustration>
)
