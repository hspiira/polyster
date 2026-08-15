#!/usr/bin/env node
/**
 * Proves replication actually moves rows, in both directions, against a real
 * Supabase project. These are the two lines of the Phase 0 exit checklist that
 * cannot be checked from a keyboard alone and that section 89 does not evidence.
 *
 * Opt-in and separate from `pnpm test:e2e` on purpose: this one writes to a live
 * project. `test:e2e` must stay safe to run on any branch at any time.
 *
 *   pnpm dev                       # in another terminal
 *   pnpm verify:sync -- --email=owner@example.ug --password=...
 *
 * The account must already own a shop (`shops.supabase_auth_user_id`). It writes
 * one client row, reads it back through PostgREST, edits it server-side to prove
 * the pull direction, then deletes it. Cleanup runs even on failure.
 */
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { CONTEXTS, requireServer, watchErrors } from '../.claude/skills/run-polyster/app.mjs'

try {
  process.loadEnvFile()
} catch {}

const argv = process.argv.slice(2)
const flag = (name, fallback) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : fallback
}

const BASE = flag('url', 'http://localhost:5173').replace(/\/$/, '')
const EMAIL = flag('email')
const PASSWORD = flag('password')
/** Matches what seed-auth-users.mjs reports. Override for a real shop. */
const PIN = flag('pin', '123456')
const URL = process.env.VITE_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!EMAIL || !PASSWORD) {
  console.error(
    'Needs an account that already owns a shop:\n' +
      '  pnpm verify:sync -- --email=owner@example.ug --password=...\n\n' +
      'scripts/seed-auth-users.mjs provisions the dev accounts if you need one.',
  )
  process.exit(1)
}

if (!URL || !SERVICE_KEY) {
  console.error('VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must both be set in .env.')
  process.exit(1)
}

await requireServer(BASE)

const admin = createClient(URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const results = []
const check = (name, pass, detail = '') => {
  results.push({ name, pass })
  console.log(`${pass ? 'ok  ' : 'FAIL'}  ${name}${pass || !detail ? '' : `\n        ${detail}`}`)
}

// Recognisable on sight, so a failed cleanup is obvious in the table rather than
// looking like a real customer.
const MARKER = `zz-sync-check-${Date.now()}`
const errors = []
let createdId = null
let browser = null

try {
  const { data: user, error: authError } = await admin.auth.signInWithPassword({
    email: EMAIL,
    password: PASSWORD,
  })
  if (authError) throw new Error(`sign-in as ${EMAIL} failed: ${authError.message}`)

  const { data: shop, error: shopError } = await admin
    .from('shops')
    .select('id, name')
    .eq('supabase_auth_user_id', user.user.id)
    .maybeSingle()
  if (shopError) throw new Error(shopError.message)
  if (!shop) throw new Error(`${EMAIL} owns no shop, so there is nothing to sync into`)
  console.log(`shop: ${shop.name} (${shop.id})\n`)

  browser = await chromium.launch()
  const ctx = await browser.newContext(CONTEXTS.phone)
  const page = await ctx.newPage()
  watchErrors(page, 'sync', errors)

  /* Signing in rather than walking setup: a locally created shop would be
     auto-claimed to this account, and shops.supabase_auth_user_id is unique. */
  await page.goto(BASE + '/', { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)

  const signIn = page.getByText(/sign in|already have/i)
  if (await signIn.count()) await signIn.first().click()
  await page.waitForTimeout(900)

  const fields = page.locator('input:not([type="search"])')
  if ((await fields.count()) < 2) {
    throw new Error('could not find the email and password fields on the entry screen')
  }
  await fields.nth(0).fill(EMAIL)
  await fields.nth(1).fill(PASSWORD)
  await page.getByRole('button', { name: /sign in|continue/i }).first().click()

  // The first pull has to land before the local store is a copy of anything.
  await page.waitForTimeout(9000)

  /* A claimed shop whose staff have PINs opens on the lock screen, not the
     shell, so every route renders the pad until this is entered. */
  const pad = page.locator('input[inputmode="numeric"]')
  if (await pad.count()) {
    await pad.first().fill(PIN)
    await page.waitForTimeout(4000)
  }

  const settled = await page.locator('body').innerText()
  check('the app signs in, unlocks and settles', !/sign in|enter your pin/i.test(settled), settled.slice(0, 200))

  /* Push: a row written locally must reach Postgres with no manual retry. */
  await page.goto(BASE + '/clients', { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)
  const add = page.getByRole('button', { name: /add/i })
  if (!(await add.count())) {
    // Naming what is on screen instead: the usual cause is a gate this script
    // did not get past, and the button list says which one.
    const names = await page.locator('button').allInnerTexts()
    throw new Error(`no Add button on /clients. Buttons present: ${JSON.stringify(names)}`)
  }
  await add.first().click()
  await page.waitForTimeout(700)
  const sheetFields = page.locator('input:not([type="search"])')
  await sheetFields.nth(0).fill(MARKER)
  const save = page.getByRole('button', { name: /save client/i })
  if (await save.count()) await save.first().click()
  await page.waitForTimeout(9000)

  const { data: pushed } = await admin
    .from('clients')
    .select('id, name, shop_id')
    .eq('name', MARKER)
    .maybeSingle()
  createdId = pushed?.id ?? null
  check('a client written locally reaches Postgres', Boolean(pushed), 'no row with that name')
  check(
    'it lands under the signed-in shop, not another tenant',
    pushed?.shop_id === shop.id,
    `shop_id was ${pushed?.shop_id}`,
  )

  /* Pull: a change made server-side must arrive without a reload. */
  if (createdId) {
    const renamed = `${MARKER}-from-server`
    const { error: updateError } = await admin
      .from('clients')
      .update({ name: renamed })
      .eq('id', createdId)
    if (updateError) throw new Error(updateError.message)

    let arrived = false
    for (let i = 0; i < 20 && !arrived; i += 1) {
      await page.waitForTimeout(1500)
      arrived = (await page.locator('body').innerText()).includes(renamed)
    }
    check('a change made in Postgres arrives with no page reload', arrived)
  }
} catch (err) {
  check('the run completed', false, err instanceof Error ? err.message : String(err))
} finally {
  if (createdId) {
    const { error } = await admin.from('clients').delete().eq('id', createdId)
    console.log(error ? `\nCLEANUP FAILED for ${createdId}: ${error.message}` : `\ncleaned up ${MARKER}`)
  }
  if (browser) await browser.close()
}

const failed = results.filter((r) => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
if (errors.length) {
  console.log('\nconsole errors:')
  console.log([...new Set(errors)].slice(0, 20).join('\n'))
}
if (failed.length) process.exitCode = 1
