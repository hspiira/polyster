# Polyster seed fixtures

These fixtures were generated against the current `main` branch of
`hspiira/polyster` as reviewed on 2026-08-12.

## Files

- `src/dev/fixtures/base.ts` — richer tenant setup with UGX/Africa-Kampala and a
  six-digit test PIN.
- `src/dev/fixtures/_fixture_helpers.ts` — fixture-only re-export barrel.
- `src/dev/fixtures/northfound.ts` — NORTH//FOUND offline-capable/core fixture.
- `src/dev/fixtures/tailor.ts` — generic tailor fixture.
- `src/dev/fixtures/edge-cases.ts` — feature-disabled, historical-data,
  inactive-staff and manager-role cases.
- `src/dev/fixtures/index.ts` — exports.
- `supabase/seed.sql` — development/staging seed for the complete online schema,
  including catalogue, collections, suppliers, materials, inventory,
  production, garment units and passport-compatible data.

## Test PIN

Local fixtures use `123456` for seeded staff.

The Supabase seed deliberately does not write PIN hashes. Use the local fixtures
for PIN-gate testing; for a real Supabase environment, set PINs through the
application.

## Which seed do you want

They are not interchangeable, and running both is usually wrong.

`supabase/seed.sql` writes the remote Postgres. Because replication is
bidirectional across every table in `REPLICATED_TABLES`, signing in as one of
the seeded auth users pulls that data into the browser on its own. This is the
path to use when Supabase is configured.

The local fixtures write IndexedDB directly and are for working offline, with
no Supabase configured. They also cover ground the SQL seed does not: rental,
repair and purchase orders, corporate order fields, and staff PINs.

Seeding locally while replication is live would push a second set of tenants
upstream, so `seedAll` refuses unless passed `{ force: true }`.

## Running the local fixtures

In a dev build, from the browser console:

```js
const db = await __polyster.getDatabase()
await __polyster.seedAll(db)   // NORTH//FOUND, generic tailor, edge cases
```

Then reload. IndexedDB is per browser profile, so this seeds only the browser
it is run in.

## Running the SQL seed

Migrations `0001..0020` must already be applied.

```sh
export PGSSLMODE=verify-full
export PGSSLROOTCERT=/path/to/prod-ca-2021.crt   # Supabase project CA
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/seed.sql
```

`verify-full` is not optional. Lower modes (`prefer`, `allow`) silently fall
back to an unencrypted connection and send the database password in plaintext.
Behind the Supabase pooler, `pg_stat_ssl` reports the pooler's own link rather
than yours, so confirm with `\conninfo` instead.

`SUPABASE_DB_URL` is deliberately not `VITE_`-prefixed. Vite inlines every
`VITE_` variable into the client bundle, and that string authenticates as
`postgres`, which bypasses RLS.

To confirm RLS still confines a normal user after seeding:

```sql
begin;
  set local role authenticated;
  select set_config('request.jwt.claims', '{"sub":"<auth-user-uuid>"}', true);
  select name from shops;   -- must return only that user's shop
commit;
```

## Important

The local fixtures only seed the collections that currently exist in RxDB.
Online-only modules are intentionally seeded in `supabase/seed.sql`.

The SQL seed expects at least two existing Supabase Auth users. The first two
users by creation time are assigned to NORTH//FOUND and Mirembe Tailoring House.
Run it only on development/staging data.

The SQL contains a clean-up step for the two fixture tenants before inserting
them. It is not intended for production.
