#!/usr/bin/env node
/* Applies every migration, then the seed, to a throwaway local Postgres and
   checks the result. Until this existed the migrations could only be tested by
   running them against a real Supabase project, which nobody does twice.
 *
 * Needs psql on PATH and a local Postgres. Skips (exit 0) without one, so it
 * can sit in CI where there is none.
 */
import { execFileSync } from 'node:child_process'
import { readdirSync, writeFileSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const DB = 'polyster_schema_check'
const MIGRATIONS = 'supabase/migrations'

/* Stand-ins for what Supabase provides and the migrations reference. Kept
   deliberately thin: this checks our SQL, not Supabase's. */
const STUBS = `
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key, email text);
create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;

create schema if not exists storage;
create table if not exists storage.buckets (id text primary key, name text, public boolean default false);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text,
  owner uuid
);
alter table storage.objects enable row level security;
create or replace function storage.foldername(name text)
returns text[] language sql immutable as $$ select string_to_array(name, '/') $$;

do $$ begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
end $$;

insert into auth.users (id, email) values
  ('10000000-0000-4000-8000-000000000001', 'owner@northfound.ug'),
  ('10000000-0000-4000-8000-000000000002', 'owner@mirembetailoring.co.ug')
on conflict do nothing;
`

function psql(args, database = DB) {
  return execFileSync('psql', ['-q', '-v', 'ON_ERROR_STOP=1', '-d', database, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

function available() {
  try {
    execFileSync('psql', ['-d', 'postgres', '-c', 'select 1'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

if (!available()) {
  console.log('skipped: no local Postgres reachable by psql')
  process.exit(0)
}

const problems = []

try {
  psql(['-c', `drop database if exists ${DB}`], 'postgres')
  psql(['-c', `create database ${DB}`], 'postgres')

  const scratch = mkdtempSync(join(tmpdir(), 'polyster-schema-'))
  const stubFile = join(scratch, 'stubs.sql')
  writeFileSync(stubFile, STUBS)
  psql(['-f', stubFile])

  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()
  for (const file of files) {
    try {
      psql(['-f', join(MIGRATIONS, file)])
    } catch (error) {
      problems.push(`${file}: ${String(error.stderr ?? error.message).trim().split('\n')[0]}`)
    }
  }
  console.log(`applied ${files.length} migrations`)

  try {
    psql(['-f', 'supabase/seed.sql'])
    console.log('applied seed.sql')
  } catch (error) {
    problems.push(`seed.sql: ${String(error.stderr ?? error.message).trim().split('\n')[0]}`)
  }

  /* Ids are cuid2, so every id column has to be text. The one exception is the
     column Supabase owns: auth.uid() returns uuid. */
  const stray = psql([
    '-t',
    '-A',
    '-c',
    `select table_name || '.' || column_name from information_schema.columns
      where table_schema='public' and data_type='uuid'
        and not (table_name='shops' and column_name='supabase_auth_user_id')`,
  ]).trim()
  if (stray) problems.push(`uuid columns that should be text: ${stray.split('\n').join(', ')}`)

  /* Every synced table carries the same three columns. The sync engine has one
     code path, so a table missing one would be silently skipped or crash it. */
  const SYNC_COLUMNS = ['updated_at', 'deleted_at', '_modified']
  for (const column of SYNC_COLUMNS) {
    const without = psql([
      '-t',
      '-A',
      '-c',
      `select t.tablename from pg_tables t
        where t.schemaname='public'
          and not exists (
            select 1 from information_schema.columns c
             where c.table_schema='public' and c.table_name=t.tablename
               and c.column_name='${column}')
        order by 1`,
    ]).trim()
    if (without) problems.push(`tables with no ${column}: ${without.split('\n').join(', ')}`)
  }

  const leftoverDeleted = psql([
    '-t',
    '-A',
    '-c',
    `select table_name from information_schema.columns
      where table_schema='public' and column_name='_deleted' order by 1`,
  ]).trim()
  if (leftoverDeleted) {
    problems.push(`_deleted should be deleted_at: ${leftoverDeleted.split('\n').join(', ')}`)
  }

  const counts = psql([
    '-t',
    '-A',
    '-c',
    `select (select count(*) from pg_tables where schemaname='public') || ' tables, ' ||
            (select count(*) from pg_constraint c join pg_class t on t.oid=c.conrelid
              where c.contype='f' and t.relnamespace='public'::regnamespace) || ' foreign keys, ' ||
            (select count(*) from orders) || ' seeded orders'`,
  ]).trim()
  console.log(counts)

  if (Number(psql(['-t', '-A', '-c', 'select count(*) from orders']).trim()) === 0) {
    problems.push('the seed produced no orders')
  }
} catch (error) {
  problems.push(String(error.stderr ?? error.message).trim().split('\n')[0])
} finally {
  try {
    psql(['-c', `drop database if exists ${DB}`], 'postgres')
  } catch {
    // A leftover scratch database is not worth failing the check over.
  }
}

if (problems.length > 0) {
  console.error(`\n${problems.length} problem${problems.length === 1 ? '' : 's'}:`)
  for (const problem of problems) console.error(`  ${problem}`)
  process.exit(1)
}

console.log('schema: clean')
