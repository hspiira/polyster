/**
 * Joins class parts, dropping falsy ones and collapsing whitespace.
 *
 * Lives here rather than in ui.tsx so tests can import it without pulling a
 * JSX module into the node-environment suite.
 *
 * Takes `unknown` because Preact types a `class` prop as `Signalish<string>`,
 * which permits a signal object. Nothing in this app uses signals; anything
 * that is not a string is dropped rather than stringified into "[object Object]".
 */
export function cn(...parts: unknown[]): string {
  return parts
    .filter((part): part is string => typeof part === 'string')
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}
