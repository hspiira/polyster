#!/usr/bin/env node
// Gives existing shops an email and password, for the move off phone OTP.
//
// Dry run by default: it prints every shop, its auth user, and what it would
// change, and touches nothing. `--apply` performs the writes.
//
// Needs SUPABASE_SERVICE_ROLE_KEY (Project Settings -> API -> service_role).
// That key bypasses RLS and can rewrite any user's credentials, so it must
// never carry a VITE_ prefix and must never reach the browser bundle.
//
// Usage:
//   node scripts/set-shop-credentials.mjs                        # dry run, no map needed
//   node scripts/set-shop-credentials.mjs --map shops.json       # dry run against a map
//   node scripts/set-shop-credentials.mjs --map shops.json --apply
//
// The map is keyed by shop id or exact shop name:
//   { "Kampala Tailors": { "email": "owner@example.com" },
//     "8f3e...": { "email": "two@example.com", "password": "chosen-if-you-want" } }
//
// Passwords are generated when the map does not supply one, and printed once.
// There is no way to read them back afterwards.

import { readFileSync } from 'node:fs'
import { randomInt } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

try {
  process.loadEnvFile()
} catch {
  // No .env file -- fine, the vars may be exported.
}

const args = process.argv.slice(2)
const apply = args.includes('--apply')
const mapPath = args[args.indexOf('--map') + 1]
const wantsMap = args.includes('--map')

const url = process.env.VITE_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceKey) {
  console.error(
    'VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must both be set.\n' +
      'The service_role key is under Project Settings -> API. Add it to .env as\n' +
      'SUPABASE_SERVICE_ROLE_KEY -- no VITE_ prefix, so Vite never inlines it\n' +
      'into the client bundle. It bypasses RLS; treat it like a database password.',
  )
  process.exit(1)
}

if (wantsMap && !mapPath) {
  console.error('--map needs a file path.')
  process.exit(1)
}

/** @type {Record<string, { email?: string, password?: string }>} */
let map = {}
if (mapPath) {
  try {
    map = JSON.parse(readFileSync(mapPath, 'utf8'))
  } catch (err) {
    console.error(`Could not read ${mapPath}: ${err instanceof Error ? err.message : err}`)
    process.exit(1)
  }
}

// Ambiguous characters left out: this gets read off a screen and typed on a
// phone keyboard, and 0/O l/1/I is where that goes wrong.
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'

function generatePassword() {
  const group = () =>
    Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('')
  return `${group()}-${group()}-${group()}`
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const { data: shops, error: shopsError } = await supabase
  .from('shops')
  .select('id, name, whatsapp_number, supabase_auth_user_id, _deleted')
  .order('name')

if (shopsError) {
  console.error(`Could not read shops: ${shopsError.message}`)
  process.exit(1)
}

const live = (shops ?? []).filter((shop) => !shop._deleted)

if (live.length === 0) {
  console.log('No shops found. Nothing to do.')
  process.exit(0)
}

console.log(`${live.length} shop(s).${apply ? '' : '  DRY RUN -- nothing will be written.'}\n`)

/** @type {{ shop: string, email: string, password: string }[]} */
const issued = []
/** @type {string[]} */
const problems = []

for (const shop of live) {
  const entry = map[shop.id] ?? map[shop.name] ?? null
  const label = `${shop.name} (${shop.id.slice(0, 8)})`

  const { data: userData, error: userError } = await supabase.auth.admin.getUserById(
    shop.supabase_auth_user_id,
  )

  if (userError || !userData?.user) {
    problems.push(
      `${label}: auth user ${shop.supabase_auth_user_id} not found` +
        `${userError ? ` -- ${userError.message}` : ''}`,
    )
    continue
  }

  const user = userData.user
  const has = [user.email && `email ${user.email}`, user.phone && `phone ${user.phone}`]
    .filter(Boolean)
    .join(', ')
  console.log(`${label}\n  currently: ${has || 'no email, no phone'}`)

  if (!entry?.email) {
    console.log(
      `  SKIP  no email in the map. Add ${JSON.stringify(shop.name)} or ${JSON.stringify(shop.id)} to it.\n`,
    )
    continue
  }

  const email = String(entry.email).trim().toLowerCase()
  const password = entry.password ?? generatePassword()

  if (!apply) {
    console.log(`  would set: ${email}, ${entry.password ? 'password from map' : 'generated password'}\n`)
    issued.push({ shop: shop.name, email, password: entry.password ? '(from map)' : '(generated on apply)' })
    continue
  }

  // email_confirm marks it verified so the account works immediately. Without
  // it, a project with confirmations on leaves the shop unable to sign in and
  // waiting for mail that may never be configured.
  const { error: updateError } = await supabase.auth.admin.updateUserById(
    shop.supabase_auth_user_id,
    { email, password, email_confirm: true },
  )

  if (updateError) {
    problems.push(`${label}: ${updateError.message}`)
    console.log(`  FAILED  ${updateError.message}\n`)
    continue
  }

  console.log(`  set: ${email}\n`)
  issued.push({ shop: shop.name, email, password })
}

if (issued.length > 0) {
  console.log('---')
  console.log(apply ? 'Credentials (shown once -- record them now):' : 'Planned:')
  for (const row of issued) {
    console.log(`  ${row.shop}\n    ${row.email}\n    ${row.password}`)
  }
  if (apply) {
    console.log(
      '\nHand each shop its own line and nothing else. Tell them to change the\n' +
        'password from Settings once they are in.',
    )
  }
}

if (problems.length > 0) {
  console.error(`\n${problems.length} problem(s):`)
  for (const problem of problems) console.error(`  ${problem}`)
  process.exit(1)
}

if (!apply) {
  console.log('\nDry run only. Re-run with --apply to write these.')
}
