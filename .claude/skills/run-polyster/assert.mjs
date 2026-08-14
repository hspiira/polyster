#!/usr/bin/env node
/**
 * Assertion suite against the running app. `pnpm verify` renders no pixels and
 * cannot see a screen at all; this covers the wiring between model and screen.
 *
 * Deliberately not part of `pnpm verify`: Chromium is a per-machine install and
 * verify runs in CI on every push.
 *
 *   pnpm dev
 *   pnpm test:e2e
 */
import { chromium } from 'playwright'
import {
  CONTEXTS,
  requireServer,
  setUpShop,
  openAddClient,
  addClient,
  watchErrors,
} from './app.mjs'

const argv = process.argv.slice(2)
const flag = (name, fallback) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : fallback
}

const BASE = flag('url', 'http://localhost:5173').replace(/\/$/, '')
const SHOP = 'Assert Tailors'
const STAFF = 'Amani Okello'

await requireServer(BASE)

const results = []
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'ok  ' : 'FAIL'}  ${name}${detail && !pass ? `\n        ${detail}` : ''}`)
}

const errors = []
const browser = await chromium.launch()
const ctx = await browser.newContext(CONTEXTS.phone)
const page = await ctx.newPage()
watchErrors(page, 'phone', errors)

await setUpShop(page, { base: BASE, shop: SHOP, staff: STAFF })

/* Field publishes its hint/error ids to the control through context. Asserted on
   a real screen because nothing in the unit suite renders a component. */
if (await openAddClient(page, BASE)) {
  const phone = page.locator('input:not([type="search"])').nth(1)
  const describedBy = await phone.getAttribute('aria-describedby')
  check('Field wires aria-describedby onto its control', Boolean(describedBy), 'attribute absent')

  if (describedBy) {
    // Attribute selector, not `#id`: useId emits characters a CSS id selector
    // would need escaping for, and CSS.escape is a browser global.
    const hint = page.locator(`[id="${describedBy}"]`)
    const text = (await hint.count()) ? ((await hint.first().textContent()) ?? '') : ''
    check(
      'aria-describedby resolves to the hint element',
      text.includes('WhatsApp'),
      `id ${describedBy} -> ${text ? `"${text.slice(0, 60)}"` : 'no such element'}`,
    )
  }

  // No error yet, so the control must not claim to be invalid.
  const invalid = await phone.getAttribute('aria-invalid')
  check('a field with no error is not marked invalid', invalid === null, `aria-invalid=${invalid}`)
} else {
  check('add-client sheet opens', false, 'no Add button on /clients')
}

/* The PIN dots are a <label>, so clicking them focuses the hidden input with no
   handler. This is the regression guard for that change. */
await page.goto(BASE + '/settings/lock', { waitUntil: 'networkidle' })
await page.waitForTimeout(900)
const setPin = page.getByRole('button', { name: /pin/i })

if (await setPin.count()) {
  await setPin.first().click()
  await page.waitForTimeout(900)

  const dots = page.locator('label[for]').first()
  if (await dots.count()) {
    await dots.click()
    await page.waitForTimeout(200)
    const focused = await page.evaluate(() => {
      const el = document.activeElement
      return el ? { tag: el.tagName, mode: el.getAttribute('inputmode') } : null
    })
    check(
      'tapping the PIN dots focuses the hidden input',
      focused?.tag === 'INPUT' && focused?.mode === 'numeric',
      `activeElement=${JSON.stringify(focused)}`,
    )
  } else {
    check('PIN dots render as a label', false, 'no label[for] on the pad')
  }

  const live = page.locator('[role="status"][aria-live="polite"]')
  const liveText = (await live.count()) ? ((await live.first().textContent()) ?? '') : ''
  check(
    'PIN progress is announced in its own live region',
    /\d+ of \d+ digits entered/.test(liveText),
    `live region text: "${liveText}"`,
  )
} else {
  check('lock settings offers a PIN control', false, 'no PIN button on /settings/lock')
}

/* Order form validation. The model is unit-tested; what is unverifiable without
   a browser is that a rejection reaches the right field on screen. */
const CLIENT = 'Grace Nakato'
await addClient(page, { base: BASE, name: CLIENT })

await page.goto(BASE + '/orders/new', { waitUntil: 'networkidle' })
await page.waitForTimeout(1200)

const submit = page.getByRole('button', { name: /create order/i })
if (await submit.count()) {
  await submit.first().click()
  await page.waitForTimeout(600)

  const message = page.getByText('Choose which client this order is for.')
  const shown = (await message.count()) > 0
  check('an order with no client is rejected at the client field', shown)

  // Located by text, not role name: <button> is labelable, so Field's wrapping
  // <label> makes its accessible name "Client" rather than its own content.
  const trigger = page.locator('button', { hasText: 'Search or add a client' })
  if (shown && (await trigger.count())) {
    const invalid = await trigger.first().getAttribute('aria-invalid')
    const describedBy = await trigger.first().getAttribute('aria-describedby')
    check('the rejected control is marked invalid', invalid === 'true', `aria-invalid=${invalid}`)

    const target = describedBy ? page.locator(`[id="${describedBy}"]`) : null
    const text = target && (await target.count()) ? ((await target.first().textContent()) ?? '') : ''
    check(
      'the rejected control points at its message',
      text.includes('Choose which client'),
      `aria-describedby=${describedBy} -> "${text}"`,
    )
  }

  /* Dashboard bucketing. buildBuckets is unit-tested; this covers an order
     actually reaching Today's due-today list through the real screens. */
  if (await trigger.count()) {
    await trigger.first().click()
    await page.waitForTimeout(700)
    const hit = page.getByText(CLIENT).last()
    if (await hit.count()) await hit.click()
    await page.waitForTimeout(700)
  }

  const today = new Date().toISOString().slice(0, 10)
  const date = page.locator('input[type="date"]').first()
  if (await date.count()) await date.fill(today)

  // By placeholder: these inputs carry no type attribute and no id, and their
  // labels sit in a wrapping <label> shared with the control.
  const description = page.getByPlaceholder('Navy two-piece suit').first()
  if (await description.count()) await description.fill('Kanzu, navy')
  const price = page.getByPlaceholder('0').first()
  if (await price.count()) await price.fill('45000')

  await page.getByRole('button', { name: /create order/i }).first().click()
  await page.waitForTimeout(2500)

  await page.goto(BASE + '/', { waitUntil: 'networkidle' })
  await page.waitForTimeout(1400)
  const body = (await page.locator('body').innerText()) ?? ''
  check(
    'an order due today reaches the Today screen',
    body.includes(CLIENT),
    `Today did not mention "${CLIENT}"`,
  )

  /* The dismiss button says "Not now". It used to mean never, which left an
     unclaimed shop with no copy anywhere and no further offer of one. */
  const ASK = 'Your work is only on this phone'
  const asked = (await page.getByText(ASK).count()) > 0
  check('the backup ask appears once there is work to lose', asked)

  if (asked) {
    await page.getByRole('button', { name: /not now/i }).first().click()
    await page.waitForTimeout(600)
    check('dismissing it hides it', (await page.getByText(ASK).count()) === 0)

    await page.evaluate(() => {
      const eightDays = 8 * 86_400_000
      const at = new Date(Date.now() - eightDays).toISOString()
      localStorage.setItem('polyster.dismissed.claim', at)
    })
    await page.reload({ waitUntil: 'networkidle' })
    await page.waitForTimeout(1600)
    check('the ask comes back once the reminder window lapses', (await page.getByText(ASK).count()) > 0)

    // What an older build wrote. Unreadable must mean ask, not stay silent.
    await page.evaluate(() => localStorage.setItem('polyster.dismissed.claim', '1'))
    await page.reload({ waitUntil: 'networkidle' })
    await page.waitForTimeout(1600)
    check("a legacy '1' dismissal does not silence it forever", (await page.getByText(ASK).count()) > 0)
  }
} else {
  check('order form offers a submit', false, 'no "Create order" button on /orders/new')
}

await ctx.close()
await browser.close()

const failed = results.filter((r) => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} passed`)

if (errors.length) {
  console.log('\nconsole errors:')
  console.log([...new Set(errors)].slice(0, 20).join('\n'))
}

if (failed.length || errors.length) process.exitCode = 1
