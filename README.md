# Tailor & Rental Tracker

Offline-first PWA for cloth tailoring and rental shops. See the docs at the repo root before touching code:

- `ARCHITECTURE.md` -- system overview, read this first
- `IMPLEMENTATION_PLAN.md` -- the phase-by-phase build plan this scaffold implements Phase 0 of
- `pwa-research-notes.md`, `pwa-schema-and-screens.md`, `pwa-stack-options.md` -- full research and design detail behind every decision

## What's here right now

This is the **Phase 0 scaffold** from `IMPLEMENTATION_PLAN.md`: an installable, offline-capable app shell with the local database wired up, but no real screens yet (those are Phase 1). Opening the app shows a small status page confirming the database initialized -- that's expected at this stage.

Stack: Preact + Vite + Tailwind CSS + `vite-plugin-pwa`, RxDB (Dexie storage adapter) for local-first data, Supabase (Postgres + Auth + Realtime) as the sync backend. Full reasoning for each choice is in `pwa-stack-options.md`.

## Setup

```bash
npm install
cp .env.example .env
```

### 1. Create a Supabase project

At [supabase.com](https://supabase.com), create a new project. Under **Project Settings -> API**, copy the Project URL and the `anon` `public` key into `.env`.

### 2. Run the migration

Open the Supabase dashboard's SQL Editor and run `supabase/migrations/0001_init.sql` once, in full. This creates every table, the `order_balances` view, Row Level Security policies, and enables Realtime on the synced tables.

### 3. Create your first shop account

Each shop authenticates as one Supabase Auth user (see `ARCHITECTURE.md` section 4 for why). In the dashboard, go to **Authentication -> Users -> Add user** and create one, then in the SQL Editor:

```sql
insert into shops (name, whatsapp_number, supabase_auth_user_id)
values ('Your Shop Name', '+256700000000', '<the auth user id you just created>');
```

### 4. Run it

```bash
npm run dev
```

Open the printed local URL. The status page should show the network state and confirm the local database (RxDB) initialized -- try toggling your browser's offline mode (DevTools -> Network -> Offline) and reload; it should still load and still say the database is ready. That's the offline-first behavior working.

## What to verify before calling Phase 0 done

This has been build/type-checked and dev-server-smoke-tested in a non-browser sandbox during scaffolding, but the real verification needs an actual browser and actual Supabase project -- neither of which existed while this was built. Run through the Phase 0 exit checklist in `IMPLEMENTATION_PLAN.md` before starting Phase 1:

- Installs to home screen on an Android phone and an iPhone (Share -> Add to Home Screen on iOS)
- Loads with the device in airplane mode
- A write made offline appears in Supabase once reconnected
- A change made directly in Supabase appears locally without a page reload
- Two different shop accounts genuinely cannot see each other's data

## Project layout

```
src/
  app.tsx              Phase 0 placeholder screen -- replaced in Phase 1
  db/
    schema.ts           RxDB collection schemas, mirrors the Postgres tables
    database.ts          RxDB singleton, dev-mode + validation wiring
    replication.ts       Supabase sync wiring (starts once a shop is logged in)
  lib/
    supabaseClient.ts    Supabase client + env var handling
supabase/
  migrations/
    0001_init.sql        Full schema, RLS policies, Realtime setup
```

## A known rough edge from scaffolding, for whoever picks this up

While setting this up, several native npm packages (`@rolldown/binding-linux-x64-gnu`, `lightningcss-linux-x64-gnu`) downloaded corrupted/truncated in the sandbox this was built in, causing `vite build` to crash with a bus error. Fixed by reinstalling those specific packages. Almost certainly an artifact of that particular environment, not a real project issue -- but if a fresh `npm install` on your own machine ever produces a crash on build rather than a clear error message, a corrupted native binary download is worth checking before assuming something in the code is wrong.
