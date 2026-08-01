/**
 * Money formatting.
 *
 * ## Known limitation: the currency is hardcoded
 *
 * `shops` has no currency column, so every shop is formatted as UGX. That is
 * correct for the first shops and wrong for the product, which is explicitly
 * multi-tenant and install-anywhere (ARCHITECTURE.md section 1).
 *
 * It is left hardcoded rather than guessed at because fixing it properly means
 * a column, a migration on both sides, and a settings field -- and doing that
 * on speculation is how you end up with a currency picker nobody asked for.
 * It is a single constant in a single module precisely so the fix is small
 * when a shop outside Uganda actually turns up. Recorded as an open item in
 * IMPLEMENTATION_PLAN.md.
 */

export const CURRENCY = 'UGX'
const LOCALE = 'en-UG'

const formatter = new Intl.NumberFormat(LOCALE, {
  style: 'currency',
  currency: CURRENCY,
  // UGX has no minor unit in practice. Two decimals on every price makes a
  // shop's numbers harder to scan for no gain, so they are shown only when a
  // value actually has them.
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})

export function formatMoney(amount: number): string {
  return formatter.format(amount)
}

/**
 * Parses what someone typed into a money field.
 *
 * Accepts thousands separators and stray spaces, because a shop owner entering
 * "250,000" should not be told it is invalid. Returns null for anything that
 * is not a non-negative number -- the caller decides whether that is an error
 * or just an incomplete field.
 */
export function parseMoney(input: string): number | null {
  const cleaned = input.replace(/[\s,]/g, '')
  if (cleaned === '') return null

  const value = Number(cleaned)
  if (!Number.isFinite(value) || value < 0) return null

  // Round to two places so a pasted 1/3 cannot enter the database with
  // fourteen decimals and quietly break the balance arithmetic.
  return Math.round(value * 100) / 100
}

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

export function parseToMinor(input: string, currency: string): number | null {
  const cleaned = input.replace(/[\s,]/g, '')
  if (cleaned === '') return null

  const value = Number(cleaned)
  if (!Number.isFinite(value) || value < 0) return null

  return toMinorUnits(value, currency)
}
