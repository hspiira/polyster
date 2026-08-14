/* Phone numbers as identity (spec E1). Normalisation is `toWaNumber`'s, not a
   second opinion: the number that gets a code must be the one WhatsApp reaches. */
import { toWaNumber } from './whatsapp'

export const DEFAULT_COUNTRY_CODE = '256'

/** E.164 (`+256700000000`), or null when the number is ambiguous. */
export function toE164(phone: string, defaultCountryCode = DEFAULT_COUNTRY_CODE): string | null {
  const digits = toWaNumber(phone, defaultCountryCode)
  return digits ? `+${digits}` : null
}

/** `+256 700 000 000` -- grouped for reading back, never for storage. */
export function formatPhoneForDisplay(e164: string): string {
  const match = /^(\+\d{1,3})(\d{3})(\d{3})(\d{3,})$/.exec(e164)
  if (!match) return e164
  return `${match[1]} ${match[2]} ${match[3]} ${match[4]}`
}
