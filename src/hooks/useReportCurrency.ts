import { useMemo, useState } from 'preact/hooks'

/* The currency a money screen reports in. Minor units of two currencies cannot
   be added, so a report is always in one of them; the shop's own leads. */
export function useReportCurrency(shopCurrency: string, present: readonly string[]) {
  const options = useMemo(() => {
    const seen = new Set([shopCurrency, ...present.filter(Boolean)])
    return [...seen].sort((a, b) => (a === shopCurrency ? -1 : b === shopCurrency ? 1 : a.localeCompare(b)))
  }, [shopCurrency, present])

  const [chosen, setChosen] = useState<string | null>(null)
  const currency = chosen && options.includes(chosen) ? chosen : shopCurrency

  return { currency, options, setCurrency: setChosen }
}
