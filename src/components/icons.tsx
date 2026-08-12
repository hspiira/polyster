/**
 * Inline SVG icons.
 *
 * Hand-rolled rather than an icon package, for the reason in ARCHITECTURE.md
 * section 8: bundle size is a design constraint here, not a metric. A library
 * would add tens of kilobytes and a font request for the dozen glyphs this app
 * actually uses. These are a few hundred bytes each and tree-shake.
 *
 * All 24x24, 1.75 stroke, `currentColor`, so an icon inherits the colour and
 * size of whatever it sits in.
 */
import type { JSX } from 'preact'

type IconProps = JSX.SVGAttributes<SVGSVGElement> & { size?: number }

function Icon({ size = 24, children, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.75"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  )
}

export const IconHome = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5" />
  </Icon>
)

export const IconUsers = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="9" cy="8" r="3.25" />
    <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
    <path d="M16 5.5a3.25 3.25 0 0 1 0 6.4" />
    <path d="M17.5 20a5.5 5.5 0 0 0-2.3-4.5" />
  </Icon>
)

export const IconOrders = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 3h9l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
    <path d="M14 3v5h5" />
    <path d="M9 13h6M9 17h4" />
  </Icon>
)

/** Three dots. Opens the sheet of everything that is not a tab. */
export const IconMore = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="5" cy="12" r="1" />
    <circle cx="12" cy="12" r="1" />
    <circle cx="19" cy="12" r="1" />
  </Icon>
)

export const IconSettings = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2.5v2.2M12 19.3v2.2M4.2 4.2l1.6 1.6M18.2 18.2l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.2 19.8l1.6-1.6M18.2 5.8l1.6-1.6" />
  </Icon>
)

export const IconChart = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 20V11M12 20V4M20 20v-6" />
  </Icon>
)

export const IconPlus = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
)

export const IconChevronRight = (p: IconProps) => (
  <Icon {...p}>
    <path d="m9 5 7 7-7 7" />
  </Icon>
)

export const IconChevronLeft = (p: IconProps) => (
  <Icon {...p}>
    <path d="m15 5-7 7 7 7" />
  </Icon>
)

export const IconSearch = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4.5 4.5" />
  </Icon>
)

export const IconCheck = (p: IconProps) => (
  <Icon {...p}>
    <path d="m5 13 4.5 4.5L19 7" />
  </Icon>
)

export const IconWhatsApp = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.5 20.5 5 16.2A8.2 8.2 0 1 1 8 19.2l-4.5 1.3Z" />
    <path d="M9 9.2c.3 1.6 2.2 3.5 3.8 3.8l1-1.1 1.7.8v1.4c-2.6.5-6.1-2.9-5.6-5.6h1.4l.8 1.7-1.1 1" />
  </Icon>
)

export const IconMoney = (p: IconProps) => (
  <Icon {...p}>
    <rect x="2.5" y="6" width="19" height="12" rx="2" />
    <circle cx="12" cy="12" r="2.5" />
    <path d="M6 10v4M18 10v4" />
  </Icon>
)

export const IconClock = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Icon>
)

export const IconAlert = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 8v4.5M12 16h.01" />
  </Icon>
)

export const IconEdit = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3Z" />
    <path d="M14.5 6.5 17.5 9.5" />
  </Icon>
)

export const IconTrash = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 7h16M10 7V5h4v2M6 7l1 13h10l1-13" />
  </Icon>
)

export const IconDownload = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3v11M8 10.5l4 4 4-4" />
    <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
  </Icon>
)

export const IconArrowUp = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 19V5M6 11l6-6 6 6" />
  </Icon>
)

export const IconArrowDown = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 5v14M6 13l6 6 6-6" />
  </Icon>
)

export const IconArrowUpRight = (p: IconProps) => (
  <Icon {...p}>
    <path d="M7 17 17 7M8 7h9v9" />
  </Icon>
)

export const IconRuler = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.5 8.5 8.5 3.5 20.5 15.5 15.5 20.5Z" />
    <path d="M7 8l1.5 1.5M10 11l1.5 1.5M13 14l1.5 1.5" />
  </Icon>
)

export const IconBackspace = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 5h12a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H8l-5.5-7L8 5Z" />
    <path d="m12 9.5 5 5M17 9.5l-5 5" />
  </Icon>
)

export const IconTag = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.5 12.8V4.5a1 1 0 0 1 1-1h8.3a1 1 0 0 1 .7.3l6.7 6.7a1 1 0 0 1 0 1.4l-7.3 7.3a1 1 0 0 1-1.4 0L3.8 12.5a1 1 0 0 1-.3-.7Z" />
    <circle cx="8" cy="8" r="1.4" />
  </Icon>
)

export const IconLock = (p: IconProps) => (
  <Icon {...p}>
    <rect x="4.5" y="10.5" width="15" height="10" rx="2" />
    <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
  </Icon>
)

export const IconReceipt = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 3.5h14v17l-2.3-1.6-2.4 1.6-2.3-1.6-2.4 1.6L7.3 19 5 20.5Z" />
    <path d="M9 8h6M9 12h6" />
  </Icon>
)

export const IconToggle = (p: IconProps) => (
  <Icon {...p}>
    <rect x="2.5" y="7" width="19" height="10" rx="5" />
    <circle cx="16" cy="12" r="3" fill="currentColor" stroke="none" />
  </Icon>
)

/** A delivery truck: suppliers. */
export const IconTruck = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 6.5h10v9H3z" />
    <path d="M13 10h4l3 3v2.5h-7z" />
    <circle cx="7" cy="17.5" r="1.6" />
    <circle cx="16.5" cy="17.5" r="1.6" />
  </Icon>
)

/** A spool of thread: materials. */
export const IconSpool = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 4h12M6 20h12" />
    <path d="M7 4c0 4 3 4 3 8s-3 4-3 8M17 4c0 4-3 4-3 8s3 4 3 8" />
  </Icon>
)

/** A stacked box: inventory. */
export const IconBox = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 8 12 4l8 4-8 4-8-4Z" />
    <path d="M4 8v9l8 4 8-4V8" />
    <path d="M12 12v9" />
  </Icon>
)

/** A factory: production. */
export const IconFactory = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 20V11l5 3.5V11l5 3.5V11l5 3.5V20Z" />
    <path d="M4 20h16" />
    <path d="M7 11V8" />
  </Icon>
)

/** Stacked layers: collections. */
export const IconLayers = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3 3 8l9 5 9-5-9-5Z" />
    <path d="M3 12l9 5 9-5" />
    <path d="M3 16l9 5 9-5" />
  </Icon>
)

/** A loop: a rental, which goes out and comes back. */
export const IconRepeat = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 12a8 8 0 0 1 8-8 8 8 0 0 1 6.9 4" />
    <path d="M20 12a8 8 0 0 1-8 8 8 8 0 0 1-6.9-4" />
    <path d="M19 3v5h-5" />
    <path d="M5 21v-5h5" />
  </Icon>
)

/** Scissors: a repair. A needle and thread turns to mush at 16px. */
export const IconScissors = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="6" cy="6" r="2.6" />
    <circle cx="6" cy="18" r="2.6" />
    <path d="M20 4 8.4 15.6" />
    <path d="M14.6 14.6 20 20" />
    <path d="M8.4 8.4 12 12" />
  </Icon>
)

/** A fingerprint: an individual garment's own identity. */
export const IconFingerprint = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 4a8 8 0 0 1 8 8v3" />
    <path d="M4 15v-3a8 8 0 0 1 4-6.93" />
    <path d="M8 20a8 8 0 0 0 8-8" />
    <path d="M12 8a4 4 0 0 1 4 4v4" />
    <path d="M8 12a4 4 0 0 1 4-4" />
    <path d="M12 12v4" />
  </Icon>
)
