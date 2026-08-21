/* The app's only id generator. cuid2: 24 url-safe characters, collision
   resistant without a central authority, and it leaks no timestamp. */
import { createId } from '@paralleldrive/cuid2'

export function newId(): string {
  return createId()
}
