-- Empties the public schema so migrations 0001..0022 can be applied to a
-- project that already has an older version of them.
--
-- Needed because there is no migration ledger. Migrations are applied by hand,
-- 0001 says outright it is not rerunnable, and 0001..0020 were rewritten on
-- 2026-08-22 to declare text ids. A project migrated before that date holds a
-- schema the repository no longer describes, and nothing can tell you which.
--
-- DESTRUCTIVE. Every row in public is gone. Development and staging only.
--
-- Run this, then 0001..0022 in order, then seed.sql.

drop schema if exists public cascade;
create schema public;

-- Supabase grants these on a new project; recreating the schema drops them.
-- Skips a role that is absent, so this also runs against a plain Postgres.
do $$
declare
  r text;
begin
  foreach r in array array['postgres', 'anon', 'authenticated', 'service_role']
  loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('grant usage on schema public to %I', r);
      execute format('grant all on all tables in schema public to %I', r);
      execute format('grant all on all routines in schema public to %I', r);
      execute format('grant all on all sequences in schema public to %I', r);
      execute format(
        'alter default privileges in schema public grant all on tables to %I', r);
      execute format(
        'alter default privileges in schema public grant all on routines to %I', r);
      execute format(
        'alter default privileges in schema public grant all on sequences to %I', r);
    end if;
  end loop;
end $$;

-- The publication survives the schema drop but keeps dangling members.
-- Recreating it empty lets each migration add its own tables back.
drop publication if exists supabase_realtime;
create publication supabase_realtime;
