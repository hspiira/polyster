#!/usr/bin/env node
/**
 * Drives the Polyster PWA in headless Chromium and writes screenshots.
 *
 * Must be run from inside the repo (node resolves `playwright` by walking up
 * to ./node_modules -- a copy of this file in /tmp fails with ERR_MODULE_NOT_FOUND).
 *
 *   node .claude/skills/run-polyster/driver.mjs
 *   node .claude/skills/run-polyster/driver.mjs /settings /clients
 *   node .claude/skills/run-polyster/driver.mjs --platform=web --theme=light
 *
 * Flags:
 *   --platform=phone|web|both   default both
 *   --theme=light|dark|both     default both
 *   --out=DIR                   default ./.screenshots
 *   --url=URL                   default http://localhost:5173
 *   --shop="Name"               shop created during setup
 *   --staff="Name"              staff member created during setup
 *   --no-client                 skip creating the sample client
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { CONTEXTS, requireServer, setUpShop, addClient, setTheme, watchErrors } from './app.mjs'

const argv = process.argv.slice(2)
const flag = (name, fallback) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : fallback
}
const has = (name) => argv.includes(`--${name}`)

const BASE = flag('url', 'http://localhost:5173').replace(/\/$/, '')
const OUT = resolve(flag('out', '.screenshots'))
const SHOP = flag('shop', 'Northfound Tailors')
const STAFF = flag('staff', 'Amani Okello')
const PLATFORMS = flag('platform', 'both') === 'both' ? ['phone', 'web'] : [flag('platform')]
const THEMES = flag('theme', 'both') === 'both' ? ['light', 'dark'] : [flag('theme')]

const ROUTES = argv.filter((a) => a.startsWith('/'))
const DEFAULT_ROUTES = [
  '/',
  '/settings',
  '/settings/shop',
  '/settings/features',
  '/settings/staff',
  '/clients',
  '/orders',
  '/money',
]
const TARGETS = ROUTES.length ? ROUTES : DEFAULT_ROUTES

mkdirSync(OUT, { recursive: true })

await requireServer(BASE)

const slug = (route) => (route === '/' ? 'today' : route.slice(1).replace(/\//g, '-'))
const errors = []
const browser = await chromium.launch()

for (const platform of PLATFORMS) {
  const ctx = await browser.newContext(CONTEXTS[platform])
  const page = await ctx.newPage()
  watchErrors(page, platform, errors)

  await setUpShop(page, { base: BASE, shop: SHOP, staff: STAFF })
  if (!has('no-client')) await addClient(page, { base: BASE })

  for (const theme of THEMES) {
    for (const route of TARGETS) {
      await page.goto(BASE + route, { waitUntil: 'networkidle' })
      await page.waitForTimeout(700)
      await setTheme(page, theme)
      const name = `${platform}-${theme}-${slug(route)}`
      await page.screenshot({ path: `${OUT}/${name}.png` })
      console.log('shot', name)
    }

    // One detail screen, which needs an id only known at runtime.
    await page.goto(BASE + '/clients', { waitUntil: 'networkidle' })
    await page.waitForTimeout(600)
    const link = page.locator('a[href^="/clients/"]').first()
    if (await link.count()) {
      await link.click()
      await page.waitForTimeout(1000)
      await setTheme(page, theme)
      const name = `${platform}-${theme}-client-detail`
      await page.screenshot({ path: `${OUT}/${name}.png` })
      console.log('shot', name)
    }
  }

  await ctx.close()
}

await browser.close()

console.log(`\nscreenshots -> ${OUT}`)
if (errors.length) {
  console.log('\nconsole errors:')
  console.log([...new Set(errors)].slice(0, 20).join('\n'))
  process.exitCode = 1
} else {
  console.log('console errors: none')
}
