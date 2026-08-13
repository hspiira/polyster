/**
 * The app's icon set: Lucide, re-exported under this app's names.
 *
 * These were hand-drawn SVG paths, for the bundle reason in ARCHITECTURE.md
 * section 8. That reasoning held for the size and not for the drawing -- the
 * hand-rolled gear read as a sun, Orders and Pre-orders were the same glyph,
 * and stroke weights drifted between icons. Lucide is per-icon tree-shaken, so
 * only the ones named below reach the bundle.
 *
 * Names stay stable so call sites do not care where a glyph comes from.
 * `WhatsApp` is the one exception and is still hand-drawn: it is a brand mark,
 * and Lucide does not ship brand logos.
 */
import type { JSX } from 'preact'
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  Banknote,
  BadgeCheck,
  BarChart3,
  Building2,
  CalendarClock,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Contrast,
  Delete,
  Download,
  Factory,
  FileText,
  Fingerprint,
  Globe,
  Home,
  Image,
  Layers,
  Lock,
  LogOut,
  Mail,
  MoreHorizontal,
  Package,
  Pencil,
  Plus,
  Receipt,
  RefreshCw,
  Ruler,
  Scissors,
  Search,
  Settings,
  Shirt,
  ShoppingBag,
  Smartphone,
  Spool,
  Store,
  Tag,
  ToggleRight,
  Trash2,
  Truck,
  Users,
  Wrench,
} from 'lucide-preact'

/**
 * Lucide sizes by `size` and strokes by `strokeWidth`, both of which this app
 * already passes as `size`. 1.75 matches what the hand-rolled set used, so
 * nothing changes weight.
 */
export type IconProps = JSX.SVGAttributes<SVGSVGElement> & { size?: number }

/** What every export below is. Use this to type an icon held in a variable. */
export type IconComponent = typeof Home

export const IconHome = Home
export const IconUsers = Users
export const IconOrders = FileText
export const IconMore = MoreHorizontal
export const IconSettings = Settings
export const IconChart = BarChart3
export const IconPlus = Plus
export const IconChevronRight = ChevronRight
export const IconChevronLeft = ChevronLeft
export const IconSearch = Search
export const IconCheck = Check
export const IconMoney = Banknote
export const IconClock = Clock
export const IconAlert = AlertTriangle
export const IconEdit = Pencil
export const IconTrash = Trash2
export const IconDownload = Download
export const IconArrowUp = ArrowUp
export const IconArrowDown = ArrowDown
export const IconArrowUpRight = ArrowUpRight
export const IconRuler = Ruler
export const IconBackspace = Delete
export const IconTag = Tag
export const IconLock = Lock
export const IconStore = Store
export const IconMail = Mail
export const IconGlobe = Globe
export const IconImage = Image
export const IconInstall = Smartphone
export const IconContrast = Contrast
export const IconSignOut = LogOut
export const IconReceipt = Receipt
export const IconToggle = ToggleRight
export const IconTruck = Truck
export const IconSpool = Spool
export const IconBox = Package
export const IconFactory = Factory
export const IconLayers = Layers
export const IconRepeat = RefreshCw
export const IconScissors = Scissors
export const IconFingerprint = Fingerprint
export const IconPreOrder = CalendarClock
export const IconCorporate = Building2
export const IconSale = ShoppingBag
export const IconRepair = Wrench
export const IconGarment = Shirt
export const IconPassport = BadgeCheck

/** Brand mark, so it stays hand-drawn -- Lucide ships no logos. */
export const IconWhatsApp = ({ size = 24, ...props }: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
    {...props}
  >
    <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.87 9.87 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm0 18.15h-.01a8.2 8.2 0 0 1-4.18-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.18 8.18 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.25-8.24 2.2 0 4.27.86 5.83 2.42a8.19 8.19 0 0 1 2.41 5.83c0 4.54-3.7 8.23-8.25 8.23Zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.24-.64.8-.78.97-.15.16-.29.18-.53.06-.25-.13-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.24-.01-.38.11-.5.11-.11.25-.29.37-.44.12-.15.16-.25.25-.41.08-.17.04-.31-.02-.44-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.43h-.47c-.17 0-.43.06-.66.31-.22.24-.87.85-.87 2.07s.9 2.4 1.02 2.56c.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.08.14-1.18-.06-.11-.22-.17-.47-.29Z" />
  </svg>
)
