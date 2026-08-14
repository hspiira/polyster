/* Joins class parts, dropping falsy ones. Takes `unknown` because Preact types
   `class` as Signalish; a non-string is dropped, not stringified. */
export function cn(...parts: unknown[]): string {
  return parts
    .filter((part): part is string => typeof part === 'string')
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}
