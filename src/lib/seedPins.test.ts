import { expect, it } from 'vitest'
import { verifyPin } from './pin'

/** The five `staff.pin_hash` literals in supabase/seed.sql. */
const SEEDED = [
  'pbkdf2$sha256$210000$EtTlgjH1pjERBgedXgyo3w==$lLsfBiirjOVxRLt20y4dVvqj8DqPAiR3Mv14Rzix2nw=',
  'pbkdf2$sha256$210000$z4No4EpOU0nEfoKF1jmjRg==$CCWEnFk/u7R7xpUQTZ3wvuiIWCC7YRkh4K3vbNkkz1Y=',
  'pbkdf2$sha256$210000$W7ag3NGjXvy8EtYVBuWS7g==$xc/hSRXQR2m2/sUImwpCXQR+URqxWijKSoqMJy2yNgc=',
  'pbkdf2$sha256$210000$y9q/URNQe0Rr+J6ujW+bWQ==$/5X6tPTtTkJhXCxIN4HI6KX1NtB14PP5lCWOfCjnuvo=',
  'pbkdf2$sha256$210000$4O/viFycCcH9p1FZ4ScvfQ==$G9ro8285vaFSbsHzBBIL75UKHBk7twBj5Hqrv9WLMPM=',
]

it('accepts 123456 for every seeded staff member and nothing else', async () => {
  for (const hash of SEEDED) {
    expect(await verifyPin('123456', hash)).toBe(true)
    expect(await verifyPin('654321', hash)).toBe(false)
  }
}, 120000)
