#!/usr/bin/env node
// Creates the two Supabase Auth accounts supabase/seed.sql binds its fixture
// tenants to, so there is something to sign in as. Idempotent: an account that
// already exists has its password reset to the dev one.
//
// Run this BEFORE supabase/seed.sql. The seed looks the accounts up by email
// and fails with instructions if they are missing.
//
// Needs VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. Development and
// staging projects only -- it sets a published password on real accounts.

import { createClient } from '@supabase/supabase-js'

try {
  process.loadEnvFile()
} catch {
  // No .env file -- fine, the vars may be exported.
}

const url = process.env.VITE_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const password = process.env.SEED_PASSWORD ?? 'polyster-dev'

// Keep email confirmations off on any project these run against: they are
// placeholder addresses, not inboxes anyone is watching.
const ACCOUNTS = [
  { email: 'owner@northfound.ug', shop: 'NORTH//FOUND' },
  { email: 'owner@mirembetailoring.co.ug', shop: 'Mirembe Tailoring House' },
]

if (!url || !serviceKey) {
  console.error(
    'VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must both be set.\n' +
      'The service_role key is under Project Settings -> API. Keep it in .env as\n' +
      'SUPABASE_SERVICE_ROLE_KEY -- no VITE_ prefix, so Vite never inlines it.',
  )
  process.exit(1)
}

if (/\.supabase\.co$/.test(new URL(url).hostname) === false && !url.includes('localhost')) {
  console.warn(`Warning: ${url} does not look like a Supabase project URL.\n`)
}

if (password.length < 8) {
  console.error('SEED_PASSWORD must be at least 8 characters (the app enforces that minimum).')
  process.exit(1)
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

/**
 * There is no admin "get user by email", so this pages through the list. Two
 * accounts on a dev project will be on the first page; the loop is here so it
 * still works on a project that has accumulated users.
 */
async function findByEmail(email) {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw new Error(error.message)
    const match = data.users.find((user) => user.email?.toLowerCase() === email)
    if (match) return match
    if (data.users.length < 200) return null
  }
  return null
}

/** @type {string[]} */
const problems = []
/** @type {{ shop: string, email: string, id: string, action: string }[]} */
const results = []

for (const account of ACCOUNTS) {
  try {
    const existing = await findByEmail(account.email)

    if (existing) {
      const { error } = await supabase.auth.admin.updateUserById(existing.id, {
        password,
        email_confirm: true,
      })
      if (error) throw new Error(error.message)
      results.push({ ...account, id: existing.id, action: 'password reset' })
      continue
    }

    // email_confirm so the account is usable straight away rather than waiting
    // on mail that a dev project has no way to deliver.
    const { data, error } = await supabase.auth.admin.createUser({
      email: account.email,
      password,
      email_confirm: true,
    })
    if (error) throw new Error(error.message)
    if (!data.user) throw new Error('created but no user returned')
    results.push({ ...account, id: data.user.id, action: 'created' })
  } catch (err) {
    problems.push(`${account.email}: ${err instanceof Error ? err.message : err}`)
  }
}

for (const row of results) {
  console.log(`${row.action.padEnd(14)} ${row.email}  ->  ${row.shop}`)
  console.log(`${''.padEnd(14)} ${row.id}`)
}

/**
 * Re-point an already-seeded shop at its proper account.
 *
 * Seeds run before this existed bound their shops to whichever two auth users
 * were oldest, which on this project were disposable RLS-test accounts. Skipped
 * with --no-bind if you would rather re-run supabase/seed.sql from scratch.
 */
if (!process.argv.includes('--no-bind')) {
  console.log('')
  for (const row of results) {
    const { data: shop, error: readError } = await supabase
      .from('shops')
      .select('id, supabase_auth_user_id')
      .eq('name', row.shop)
      .maybeSingle()

    if (readError) {
      problems.push(`${row.shop}: ${readError.message}`)
      continue
    }
    if (!shop) {
      console.log(`no shop yet    ${row.shop} -- run supabase/seed.sql to create it`)
      continue
    }
    if (shop.supabase_auth_user_id === row.id) {
      console.log(`already bound  ${row.shop}`)
      continue
    }

    const { error: bindError } = await supabase
      .from('shops')
      .update({ supabase_auth_user_id: row.id })
      .eq('id', shop.id)

    if (bindError) {
      // The unique constraint on supabase_auth_user_id means one account can
      // hold one shop; a clash says this account already owns another.
      problems.push(`${row.shop}: ${bindError.message}`)
      continue
    }
    console.log(`bound          ${row.shop} -> ${row.email}`)
  }
}

if (problems.length > 0) {
  console.error(`\n${problems.length} problem(s):`)
  for (const problem of problems) console.error(`  ${problem}`)
  process.exit(1)
}

console.log(`\nPassword for both: ${password}`)
console.log('Sign in with either address. Staff PIN is 123456.')
