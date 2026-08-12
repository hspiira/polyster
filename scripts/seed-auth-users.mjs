#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js'

try {
  process.loadEnvFile()
} catch {}

const url = process.env.VITE_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const password = process.env.SEED_PASSWORD ?? 'polyster-dev'

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

const problems = []
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
