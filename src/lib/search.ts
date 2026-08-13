/* One rule for in-memory search. Phone fields match on digits only, so a
   number typed with spaces finds a record stored without them. */

export interface SearchableFields {
  text?: readonly (string | undefined | null)[]
  phone?: readonly (string | undefined | null)[]
}

function digitsOf(value: string): string {
  return value.replace(/\D/g, '')
}

export function matchesQuery(query: string, fields: SearchableFields): boolean {
  const term = query.trim().toLowerCase()
  if (!term) return true

  for (const value of fields.text ?? []) {
    if (value && value.toLowerCase().includes(term)) return true
  }

  const wanted = digitsOf(term)
  if (!wanted) return false

  /* A number typed nationally ("0700...") is the same one stored in E.164
     ("+256700..."), so the trunk zero is tried both ways. */
  const candidates = wanted.startsWith('0') ? [wanted, wanted.slice(1)] : [wanted]

  for (const value of fields.phone ?? []) {
    if (!value) continue
    const stored = digitsOf(value)
    if (candidates.some((candidate) => candidate && stored.includes(candidate))) return true
  }
  return false
}

export function filterByQuery<T>(
  items: readonly T[],
  query: string,
  fieldsOf: (item: T) => SearchableFields,
): T[] {
  if (!query.trim()) return [...items]
  return items.filter((item) => matchesQuery(query, fieldsOf(item)))
}
