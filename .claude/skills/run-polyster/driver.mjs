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
import { chromium, devices } from 'playwright'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

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

const res = await fetch(BASE).catch(() => null)
if (!res?.ok) {
  console.error(
    `Dev server not answering at ${BASE}.\nStart it first:  pnpm dev\n` +
      `(or pass --url=... if it picked another port -- Vite increments when 5173 is taken)`,
  )
  process.exit(1)
}

const slug = (route) => (route === '/' ? 'today' : route.slice(1).replace(/\//g, '-'))
const errors = []
const browser = await chromium.launch()

/**
 * The shell is chosen by pointer type, not viewport width (src/lib/platform.ts):
 * `(pointer: fine)` -> the desktop WebShell, otherwise the phone Shell. Without
 * touch emulation a 390px viewport still renders the desktop rail, and every
 * label truncates. `devices['Pixel 7']` sets hasTouch/isMobile for us.
 */
const CONTEXTS = {
  phone: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 },
  web: { viewport: { width: 1280, height: 900 } },
}

/**
 * Walks the real signup. There is no seed button -- the README's "Seed sample
 * shop data" belonged to an entry flow that has since been replaced -- and each
 * browser context gets its own empty IndexedDB, so every context re-runs this.
 */
async function setUpShop(page) {
  await page.goto(BASE + '/', { waitUntil: 'networkidle' })
  await page.waitForTimeout(900)

  const start = page.getByText('Set up my shop')
  if (!(await start.count())) return false // already set up in this context

  await start.first().click()
  await page.waitForSelector('input', { timeout: 20000 })
  await page.waitForTimeout(500)

  // Not `input[type="text"]`: these inputs carry no type attribute, so that
  // attribute selector matches nothing even though `el.type` reads "text".
  const fields = page.locator('input:not([type="search"])')
  await fields.nth(0).fill(SHOP)
  await fields.nth(1).fill(STAFF)
  await page.getByText('Start taking orders').first().click()
  await page.waitForTimeout(2500)
  return true
}

async function addClient(page) {
  await page.goto(BASE + '/clients', { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)
  const add = page.getByRole('button', { name: /add/i })
  if (!(await add.count())) return
  await add.first().click()
  await page.waitForTimeout(600)
  const fields = page.locator('input:not([type="search"])')
  if (await fields.count()) {
    await fields.nth(0).fill('Grace Nakato')
    if ((await fields.count()) > 1) await fields.nth(1).fill('+256772123456')
  }
  const save = page.getByRole('button', { name: /save client/i })
  if (await save.count()) await save.first().click()
  await page.waitForTimeout(1300)
}

/** Theme is a data-theme attribute on <html>, bootstrapped inline in index.html. */
async function setTheme(page, theme) {
  await page.evaluate((t) => {
    localStorage.setItem('polyster.theme', t)
    document.documentElement.setAttribute('data-theme', t)
  }, theme)
  await page.waitForTimeout(200)
}

for (const platform of PLATFORMS) {
  const ctx = await browser.newContext(CONTEXTS[platform])
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errors.push(`[${platform}] pageerror: ${e.message}`))
  page.on('console', (m) => m.type() === 'error' && errors.push(`[${platform}] ${m.text()}`))

  await setUpShop(page)
  if (!has('no-client')) await addClient(page)

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
