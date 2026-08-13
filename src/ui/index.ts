/* The design system's public surface. Import from `../ui`, never a file inside
   it. Components name roles; theme.css decides what a role is worth. */

export { cn } from '../lib/cn'

export {
  normalizeTone,
  TONE_SOFT,
  TONE_SOLID,
  TONE_TEXT,
  type AnyTone,
  type LegacyTone,
  type Tone,
} from './tones'

export {
  MEASURE,
  MEASURE_WIDE,
  Screen,
  Sections,
  type ScreenSection,
  type ScreenWidth,
} from './Screen'
export { Card, FLUSH_SURFACE, FLUSH_SURFACE_FLAT, SectionCard, SectionTitle, Sheet } from './Surface'
export { ChoiceSheet, TextFieldSheet } from './EditSheet'
export { Disclosure } from './Disclosure'
export { Button, HeaderAction } from './Button'
export { Field, Input, SearchInput, Segmented, Select, Switch, Textarea } from './Field'
export { CurrencySwitch, PeriodBar, PeriodRangeFields } from './Period'
export { TabRow, type TabOption } from './TabRow'
export { DataList, type CellRole, type Column } from './DataList'
export { AccentRow, DataRow, ListRow, MoreLink, RowList, SettingRow } from './Row'
export { Avatar, Chip, getInitials } from './Chip'
export { StatStrip, StatTile, StatValue } from './Stat'
export { FlowColumns, ShareBar, Sparkline, type FlowBar, type Share } from './Chart'
export { EmptyState, ErrorNote, InfoNote, Skeleton } from './Feedback'
