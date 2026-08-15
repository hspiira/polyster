/* House rules that are cheap to check and expensive to re-litigate.
   See docs/DESIGN_SYSTEM.md. Run by `pnpm verify`. */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SRC = join(ROOT, 'src')

/* theme.css is where colour is allowed to have a value. Nothing else is exempt. */
const EXEMPT_COLOUR = new Set(['src/styles/theme.css'])

const MAX_COMMENT_LINES = 2

/* `brand` is absent on purpose: theme.css publishes --color-brand-* as real
   tokens, so those are theme names rather than raw palette colours. */
const PALETTE =
  'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose'

/* The numeric step is required so the roles `neutral-soft` and `neutral-on-soft`
   are not read as Tailwind's `neutral` palette. */
const NUMBERED = new RegExp(`\\b(?:${PALETTE})-(?:\\d{2,3})\\b`, 'g')

const UTILITY =
  'bg|text|border|ring|divide|outline|decoration|fill|stroke|accent|caret|placeholder|from|via|to|shadow'

/* `white` and `black` name a colour with no step to require. */
const ACHROMATIC = new RegExp(`\\b(?:${UTILITY})-(?:white|black)\\b`, 'g')

/* A bare colour keyword in CSS, as in `color-mix(in oklch, white 5%, …)`. */
const CSS_KEYWORD = /(?:^|[\s,(])(?:white|black)(?=[\s,)%])/g

/* An arbitrary value is the most direct way to name a colour, and the one a
   palette-name scan misses entirely. */
const ARBITRARY = /-\[(?:#[0-9a-fA-F]{3,8}|(?:rgba?|hsla?|oklch|oklab|lab|lch)\()/g

/* A Tailwind variant runs straight into the utility it qualifies, which keeps
   this off the object key spelled `dark:` in Settings.tsx. */
const DARK_VARIANT = /\bdark:(?=[a-z[])/g

/* Comments are blanked before the colour scan, because the files that explain
   these rules necessarily quote them. Spaces keep line numbers honest. */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(?<!:)\/\/[^\n]*/g, (m) => ' '.repeat(m.length))
}

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) yield* walk(path)
    else if (/\.(tsx?|css)$/.test(path)) yield path
  }
}

/* Runs of consecutive comment lines. Two files' worth of rationale in one block
   is the thing being stopped, so the run is what gets measured, not the syntax. */
function longCommentRuns(source) {
  const runs = []
  let run = 0
  let start = 0
  let inBlock = false

  const flush = () => {
    if (run > MAX_COMMENT_LINES) runs.push({ line: start + 1, length: run })
    run = 0
  }

  source.split('\n').forEach((raw, i) => {
    const line = raw.trim()
    // A lint directive instructs a machine rather than explaining anything, so
    // it neither spends the two-line budget nor ends a run.
    if (!inBlock && /^\/\/\s*eslint-(disable|enable)/.test(line)) return
    const isComment = inBlock || line.startsWith('//') || line.startsWith('/*')
    if (line.startsWith('/*') && !line.includes('*/')) inBlock = true
    if (inBlock && line.includes('*/')) inBlock = false
    if (isComment) {
      if (run === 0) start = i
      run += 1
    } else flush()
  })
  flush()
  return runs
}

const COLOUR_RULES = [
  [NUMBERED, 'names a colour'],
  [ACHROMATIC, 'names a colour'],
  [ARBITRARY, 'names a colour'],
  [DARK_VARIANT, 'uses a `dark:` utility'],
]

/* A bare `white` is only a colour in a stylesheet. In TypeScript it is prose --
   the seed catalogue sells a white cotton kanzu. */
const CSS_ONLY_RULES = [[CSS_KEYWORD, 'names a colour']]

const violations = []

for (const path of walk(SRC)) {
  const rel = relative(ROOT, path)
  const source = readFileSync(path, 'utf8')

  for (const { line, length } of longCommentRuns(source)) {
    violations.push({ rel, line, text: `${length}-line comment`, rule: `over ${MAX_COMMENT_LINES} lines` })
  }

  if (EXEMPT_COLOUR.has(rel)) continue
  const rules = rel.endsWith('.css') ? [...COLOUR_RULES, ...CSS_ONLY_RULES] : COLOUR_RULES
  const code = stripComments(source)
  code.split('\n').forEach((line, i) => {
    for (const [pattern, rule] of rules) {
      for (const match of line.matchAll(pattern)) {
        violations.push({ rel, line: i + 1, text: match[0].trim(), rule })
      }
    }
  })
}

if (violations.length === 0) {
  console.log('standards: clean')
  process.exit(0)
}

const byFile = new Map()
for (const v of violations) {
  if (!byFile.has(v.rel)) byFile.set(v.rel, [])
  byFile.get(v.rel).push(v)
}

for (const [rel, list] of [...byFile].sort((a, b) => b[1].length - a[1].length)) {
  console.error(`\n${rel}  (${list.length})`)
  for (const v of list) console.error(`  ${v.line}:  ${v.text}  -- ${v.rule}`)
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`
console.error(`\n${plural(violations.length, 'violation')} in ${plural(byFile.size, 'file')}.`)
console.error('Ask for a role, not a colour. Keep comments to two lines.\n')
process.exit(1)
