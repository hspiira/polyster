import { useMemo, useState } from 'preact/hooks'

/**
 * The currency a money screen reports in, and the ones it could report in.
 *
 * Amounts are stored per row in the currency they were taken in, and minor
 * units of two currencies cannot be added together -- so a report is always
 * denominated in one of them. The shop's own currency leads; anything else the
 * books actually contain is offered beside it.
 */
export function useReportCurrency(shopCurrency: string, present: readonly string[]) {
  const options = useMemo(() => {
    const seen = new Set([shopCurrency, ...present.filter(Boolean)])
    return [...seen].sort((a, b) => (a === shopCurrency ? -1 : b === shopCurrency ? 1 : a.localeCompare(b)))
  }, [shopCurrency, present])

  const [chosen, setChosen] = useState<string | null>(null)
  const currency = chosen && options.includes(chosen) ? chosen : shopCurrency

  return { currency, options, setCurrency: setChosen }
}
