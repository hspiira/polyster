/* Money in minor units (spec §9): every amount is an integer count of the
   currency's smallest unit, so balance arithmetic never touches floats. */

const LOCALE = 'en-UG'

export const DEFAULT_CURRENCY = 'UGX'

const exponentCache = new Map<string, number>()

/** Decimal places for a currency, from ICU rather than a hand-maintained table. */
export function currencyExponent(currency: string): number {
  const cached = exponentCache.get(currency)
  if (cached !== undefined) return cached

  const resolved = new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency,
  }).resolvedOptions().maximumFractionDigits!

  exponentCache.set(currency, resolved)
  return resolved
}

export function toMinorUnits(amount: number, currency: string): number {
  return Math.round(amount * 10 ** currencyExponent(currency))
}

export function fromMinorUnits(minor: number, currency: string): number {
  return minor / 10 ** currencyExponent(currency)
}

export function formatMinor(minor: number, currency: string): string {
  const exponent = currencyExponent(currency)
  return new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: exponent,
  }).format(fromMinorUnits(minor, currency))
}

/* The number without its currency, for a screen that states it once. Still
   currency-aware: decimal places come from the same ICU lookup. */
export function formatAmount(minor: number, currency: string): string {
  return new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: 0,
    maximumFractionDigits: currencyExponent(currency),
  }).format(fromMinorUnits(minor, currency))
}

export function parseToMinor(input: string, currency: string): number | null {
  const cleaned = input.replace(/[\s,]/g, '')
  if (cleaned === '') return null

  const value = Number(cleaned)
  if (!Number.isFinite(value) || value < 0) return null

  return toMinorUnits(value, currency)
}
