#!/usr/bin/env node
// Verifies the role split that Row Level Security depends on, mirroring the
// check pattern from the timeline project's scripts/verify_rls_roles.py --
// adapted here because Polyster has no self-managed Postgres roles to create.
// Supabase already provisions the equivalent split (anon/authenticated vs.
// postgres/service_role); this script checks it's actually configured the
// way ARCHITECTURE.md section 4 assumes, rather than taking it on faith.
//
// Needs SUPABASE_DB_URL: the *direct* Postgres connection string from the
// Supabase dashboard (Project Settings -> Database -> Connection string),
// not the anon key. That connection runs as the `postgres` role, which
// bypasses RLS -- required here to read pg_roles/pg_policies/pg_class across
// every table, but exactly why this must never be the anon key and must
// never reach the browser bundle. Keep it in `.env` as SUPABASE_DB_URL
// (no VITE_ prefix -- Vite only inlines VITE_-prefixed vars into the client
// build) or export it directly for CI.
//
// What this does NOT verify: whether `select * from order_balances` as
// shop A actually returns only shop A's rows. That needs two real shop
// accounts and a live login -- see the Phase 0 exit checklist in
// docs/IMPLEMENTATION_PLAN.md. This script checks the structural
// preconditions (RLS enabled, at least one policy, roles configured
// correctly, the view's security_invoker flag) that make that manual test
// meaningful, not a substitute for running it.

import postgres from 'postgres'

try {
  // Node 22+ (see package.json engines). Absent in CI, where the var is
  // exported directly rather than living in a checked-out .env file.
  process.loadEnvFile()
} catch {
  // No .env file -- fine.
}

const dbUrl = process.env.SUPABASE_DB_URL

if (!dbUrl) {
  console.error(
    'SUPABASE_DB_URL is not set.\n' +
      'Get it from the Supabase dashboard: Project Settings -> Database -> ' +
      'Connection string (URI). Add it to .env as SUPABASE_DB_URL -- no VITE_ ' +
      'prefix, so Vite never inlines it into the client bundle.',
  )
  process.exit(1)
}

const sql = postgres(dbUrl, { max: 1 })

/** @type {string[]} */
const failures = []

function fail(message) {
  failures.push(message)
  console.error(`FAIL  ${message}`)
}

function pass(message) {
  console.log(`OK    ${message}`)
}

try {
  const roles = await sql`
    select rolname, rolbypassrls
    from pg_roles
    where rolname in ('anon', 'authenticated', 'service_role', 'postgres')
  `
  const byName = new Map(roles.map((r) => [r.rolname, r.rolbypassrls]))

  for (const name of ['anon', 'authenticated']) {
    if (!byName.has(name)) {
      fail(`role '${name}' not found -- is this really a Supabase project?`)
    } else if (byName.get(name)) {
      fail(
        `role '${name}' has BYPASSRLS. It must not: this is the role the ` +
          `app's PostgREST/Realtime connection runs as, and RLS is the only ` +
          `thing enforcing tenant isolation for it. Run: ALTER ROLE ${name} NOBYPASSRLS;`,
      )
    } else {
      pass(`role '${name}' does not bypass RLS`)
    }
  }

  if (byName.has('service_role') && !byName.get('service_role')) {
    fail(
      "role 'service_role' does not have BYPASSRLS -- unexpected for a " +
        'Supabase project; verify this against the current Supabase docs ' +
        'rather than assuming a misconfiguration.',
    )
  } else if (byName.has('service_role')) {
    pass("role 'service_role' bypasses RLS, as expected for an admin-only role")
  }

  const tables = await sql`
    select
      c.relname as table_name,
      c.relrowsecurity as rls_enabled,
      coalesce(p.policy_count, 0)::int as policy_count
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    left join (
      select tablename, count(*) as policy_count
      from pg_policies
      where schemaname = 'public'
      group by tablename
    ) p on p.tablename = c.relname
    where n.nspname = 'public'
      and c.relkind = 'r'
    order by c.relname
  `

  if (tables.length === 0) {
    fail("no tables found in schema 'public' -- has the migration been run?")
  }

  for (const t of tables) {
    if (!t.rls_enabled) {
      fail(`table '${t.table_name}' does not have row level security enabled`)
    } else if (t.policy_count === 0) {
      fail(`table '${t.table_name}' has RLS enabled but zero policies -- every read and write is denied`)
    } else {
      pass(`table '${t.table_name}': RLS enabled, ${t.policy_count} polic${t.policy_count === 1 ? 'y' : 'ies'}`)
    }
  }

  const views = await sql`
    select relname, reloptions
    from pg_class
    where relkind = 'v' and relnamespace = 'public'::regnamespace
  `

  for (const v of views) {
    const hasSecurityInvoker = (v.reloptions ?? []).some(
      (opt) => opt === 'security_invoker=true',
    )
    if (!hasSecurityInvoker) {
      fail(
        `view '${v.relname}' does not have security_invoker=on -- it runs with ` +
          `its owner's privileges, which bypasses every RLS policy on its base ` +
          `tables. See ARCHITECTURE.md section 4, rule 2.`,
      )
    } else {
      pass(`view '${v.relname}': security_invoker is on`)
    }
  }
} finally {
  await sql.end()
}

console.log('')
if (failures.length > 0) {
  console.error(`${failures.length} check(s) failed.`)
  process.exit(1)
}
console.log('All RLS structural checks passed.')
console.log(
  'Reminder: this does not replace the manual two-shop-account test in ' +
    "docs/IMPLEMENTATION_PLAN.md's Phase 0 exit checklist.",
)
