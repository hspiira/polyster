import { useMemo, useState } from 'preact/hooks'
import { today } from '../lib/dates'
import { periodLabel, periodRange, type PeriodKey, type PeriodRange } from '../lib/period'

export interface Period extends PeriodRange {
  key: PeriodKey
  /** "last 7 days", or the dates when customised. */
  label: string
  setKey: (next: PeriodKey) => void
  setRange: (next: PeriodRange) => void
}

/** The period a money screen reports on, and the controls that change it. */
export function usePeriod(initial: PeriodKey = '7'): Period {
  const now = today()
  const [key, setKey] = useState<PeriodKey>(initial)
  const [custom, setCustom] = useState<PeriodRange>(() => periodRange('7', now))

  const range = useMemo(() => periodRange(key, now, custom), [key, now, custom])

  return {
    key,
    ...range,
    label: periodLabel(key, range),
    setKey,
    setRange: setCustom,
  }
}
