/** Stricter than Supabase's own default of 6. The server enforces its own rule regardless. */
export const MIN_PASSWORD_LENGTH = 8

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function normaliseEmail(raw: string): string {
  return raw.trim().toLowerCase()
}

export function emailProblem(raw: string): string | null {
  const email = normaliseEmail(raw)
  if (!email) return 'Enter the email address for your shop.'
  if (!EMAIL_SHAPE.test(email)) return "That does not look like an email address. Check it's typed right."
  return null
}

export function passwordProblem(password: string): string | null {
  if (!password) return 'Enter your password.'
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`
  }
  return null
}
