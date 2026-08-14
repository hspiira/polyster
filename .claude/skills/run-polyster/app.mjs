/**
 * Shared browser setup for driving the Polyster PWA.
 *
 * Extracted so the screenshot driver and the assertion suite walk the same
 * signup. When the entry flow changes, it changes in one place.
 *
 * Must live inside the repo: node resolves `playwright` by walking up to
 * ./node_modules, so a copy outside it fails with ERR_MODULE_NOT_FOUND.
 */
import { devices } from 'playwright'

/**
 * The shell is chosen by pointer type, not viewport width (src/lib/platform.ts):
 * `(pointer: fine)` -> the desktop WebShell, otherwise the phone Shell. Without
 * touch emulation a 390px viewport still renders the desktop rail, and every
 * label truncates. `devices['Pixel 7']` sets hasTouch/isMobile for us.
 */
export const CONTEXTS = {
  phone: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 },
  web: { viewport: { width: 1280, height: 900 } },
}

export async function requireServer(base) {
  const res = await fetch(base).catch(() => null)
  if (res?.ok) return
  console.error(
    `Dev server not answering at ${base}.\nStart it first:  pnpm dev\n` +
      `(or pass --url=... if it picked another port -- Vite increments when 5173 is taken)`,
  )
  process.exit(1)
}

/**
 * Walks the real signup. There is no seed button -- the README's "Seed sample
 * shop data" belonged to an entry flow that has since been replaced -- and each
 * browser context gets its own empty IndexedDB, so every context re-runs this.
 *
 * Returns false when this context was already set up.
 */
export async function setUpShop(page, { base, shop, staff }) {
  await page.goto(base + '/', { waitUntil: 'networkidle' })
  await page.waitForTimeout(900)

  const start = page.getByText('Set up my shop')
  if (!(await start.count())) return false

  await start.first().click()
  await page.waitForSelector('input', { timeout: 20000 })
  await page.waitForTimeout(500)

  // Not `input[type="text"]`: these inputs carry no type attribute, so that
  // attribute selector matches nothing even though `el.type` reads "text".
  const fields = page.locator('input:not([type="search"])')
  await fields.nth(0).fill(shop)
  await fields.nth(1).fill(staff)
  await page.getByText('Start taking orders').first().click()
  await page.waitForTimeout(2500)
  return true
}

/** Opens the add-client sheet and leaves it open. */
export async function openAddClient(page, base) {
  await page.goto(base + '/clients', { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)
  const add = page.getByRole('button', { name: /add/i })
  if (!(await add.count())) return false
  await add.first().click()
  await page.waitForTimeout(600)
  return true
}

export async function addClient(page, { base, name = 'Grace Nakato', phone = '+256772123456' }) {
  if (!(await openAddClient(page, base))) return
  const fields = page.locator('input:not([type="search"])')
  if (await fields.count()) {
    await fields.nth(0).fill(name)
    if ((await fields.count()) > 1) await fields.nth(1).fill(phone)
  }
  const save = page.getByRole('button', { name: /save client/i })
  if (await save.count()) await save.first().click()
  await page.waitForTimeout(1300)
}

/** Theme is a data-theme attribute on <html>, bootstrapped inline in index.html. */
export async function setTheme(page, theme) {
  await page.evaluate((t) => {
    localStorage.setItem('polyster.theme', t)
    document.documentElement.setAttribute('data-theme', t)
  }, theme)
  await page.waitForTimeout(200)
}

/** Collects pageerror and console.error, which a passing run must leave empty. */
export function watchErrors(page, label, sink) {
  page.on('pageerror', (e) => sink.push(`[${label}] pageerror: ${e.message}`))
  page.on('console', (m) => m.type() === 'error' && sink.push(`[${label}] ${m.text()}`))
}
