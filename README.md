# Tailor & Rental Tracker

Offline-first PWA for cloth tailoring and rental shops. Read the docs in [`docs/`](docs/) before touching code:

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) -- system overview and the current record of what exists. **Read this first.**
- [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md) -- colour roles, responsiveness rules, and how to convert a screen. **Read before touching any UI.**
- [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md) -- phase-by-phase build plan and verification checklists
- [`docs/pwa-research-notes.md`](docs/pwa-research-notes.md), [`docs/pwa-schema-and-screens.md`](docs/pwa-schema-and-screens.md), [`docs/pwa-stack-options.md`](docs/pwa-stack-options.md) -- the research and design detail behind each decision, with build-time corrections marked inline

Stack: Preact + Vite + Tailwind CSS + `vite-plugin-pwa`, RxDB (Dexie storage adapter) for local-first data, Supabase (Postgres + Auth + Realtime) as the sync backend.

## Where this is

Phase 0 is **code complete but not verified**. Phase 1 steps 1-10 are built and
have been driven end to end in a desktop browser at phone dimensions.

- `pnpm verify` passes: strict typecheck, 94 tests, production build.
- Sign-in, staff PIN gate, dashboard, clients and measurements, orders with
  stages and payments, the WhatsApp button, reports, settings, and backup export
  all work against seeded fixture data.
- **Nothing has run on a phone, and nothing has run against Supabase.** Every
  sync path in the app is therefore still theory, as is tenant isolation. The
  Phase 0 exit checklist in the implementation plan is the list of what remains,
  and none of it is ticked.

## Seeded data, and how to get in

There are two seeds and they are not interchangeable.

**Local, no Supabase.** `pnpm dev`, then in the console:

```js
__polyster.getDatabase().then(db => __polyster.seedAll(db))
```

Reload. No sign-in happens at all — the shops are local and unclaimed, so the app opens straight into the PIN gate. It refuses to run when Supabase is configured, because replication would push the fixtures upstream and duplicate what `supabase/seed.sql` already seeds.

**Against Supabase.** Two steps, in this order:

```bash
pnpm seed:auth      # creates the two accounts, needs SUPABASE_SERVICE_ROLE_KEY
```

then run [`supabase/seed.sql`](supabase/seed.sql) in the SQL Editor. It matches those accounts **by email**, so the order matters — run the SQL first and it aborts with instructions rather than binding the fixtures to the wrong users.

| Sign in as | Shop | Owner PIN |
|---|---|---|
| `owner@northfound.ug` | NORTH//FOUND | `123456` |
| `owner@mirembetailoring.co.ug` | Mirembe Tailoring House | `123456` |

Password for both: `polyster-dev` (override with `SEED_PASSWORD`). **Every seeded staff PIN is `123456`.**

Signing in pulls the shop down over replication; you land on the PIN gate once it arrives.

## Setup

Requires Node 22+ and pnpm 10+ (`corepack enable` will provide pnpm).

```bash
pnpm install
cp .env.example .env
```

The app runs without a `.env`, local-only with no sync, which is useful for UI work. Everything below is needed for sync.

### 1. Create a Supabase project

At [supabase.com](https://supabase.com), create a project. Under **Project Settings -> API**, copy the Project URL and the `anon` `public` key into `.env`.

The anon key belongs in the client bundle -- it is designed to be public. Row Level Security is what protects the data, which is why the policies in the migration are load-bearing rather than a second layer of defence.

### 2. Run the migration

Open the Supabase dashboard's SQL Editor and run [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) once, in full. This creates every table, the `order_balances` view, the RLS policies, and enables Realtime on the synced tables.

Requires Postgres 15 or newer for `security_invoker` on the view. Supabase provides it; if you are pointing this at your own Postgres, check the version first, because the view silently leaks across tenants without that setting.

### 3. Configure Auth

Each shop authenticates as one Supabase Auth user with an **email and password** (see `ARCHITECTURE.md` section 4). Three settings in **Authentication**:

| Where | Setting | Value |
|---|---|---|
| Providers -> Email | Enabled | on |
| Providers -> Email | **Confirm email** | **off** |
| URL Configuration | Redirect URLs | your origin plus `/**`, e.g. `http://localhost:5173/**` |

**Confirm email off is not optional** unless you have configured custom SMTP. With it on, `signUp` returns a user but no session, and the shop is stuck on a "check your email" screen with no email arriving — Supabase's built-in sender is rate-limited and dev-only. The app detects this and says so rather than pretending to succeed.

The redirect URLs matter for Google sign-in and password resets, which both come back to the path they started from.

Optional, both off by default:

- **Google sign-in** — enable the Google provider in Supabase, then set `VITE_OAUTH_PROVIDERS=google`. The button does not render without the env var, because there is no way to ask Supabase which providers a project has enabled.
- **Password reset** — needs custom SMTP under **Project Settings -> Auth -> SMTP**. Then set `VITE_EMAIL_RECOVERY=1`. Without it the "forgotten my password" link is hidden rather than offered and silently doing nothing.

Shops self-provision from the app (migration `0004`), so no manual `insert into shops` is needed. To create one out of band anyway:

```sql
insert into shops (name, whatsapp_number, supabase_auth_user_id)
values ('Your Shop Name', '+256700000000', '<an auth user id>');
```

**Create two accounts, not one.** Tenant isolation is the single most important thing to verify and it cannot be tested with a single tenant. Give the second shop a client and an order so there is something for the first shop to fail to see.

### 3a. Verify the RLS role split (optional, recommended before step 3's manual test)

`pnpm verify:rls` checks the structural half of tenant isolation: that `anon`/`authenticated` don't have `BYPASSRLS`, that every table in `public` has RLS enabled with at least one policy, and that `order_balances` has `security_invoker` on. It needs `SUPABASE_DB_URL` in `.env` -- the *direct* Postgres connection string from **Project Settings -> Database -> Connection string**, not the anon key (see the comment in `.env.example`; this connects as the `postgres` role, which bypasses RLS itself, so it must never be used anywhere else).

This does not replace the two-shop-account login test in the Phase 0 exit checklist (`docs/IMPLEMENTATION_PLAN.md`) -- it can't verify that shop A's session actually can't read shop B's rows, only that the policies are in place for that test to be meaningful.

### 3b. Give existing shops credentials

Shops created before the move off phone OTP have an auth user with no password, so nobody can sign in on a second device. `pnpm shop:credentials` fixes that. It needs `SUPABASE_SERVICE_ROLE_KEY` in `.env`.

It is a **dry run unless you pass `--apply`**. Start there — it lists every shop, the auth user behind it, and what it currently has:

```bash
pnpm shop:credentials
```

Then write a map of shop name (or id) to email, and apply it:

```json
{ "Kampala Tailors": { "email": "owner@example.com" } }
```

```bash
node scripts/set-shop-credentials.mjs --map shops.json --apply
```

Passwords are generated unless the map supplies one, and printed **once** — there is no way to read them back. `shops*.json` is gitignored because these files hold real addresses.

### 4. Run it

```bash
pnpm dev
```

Sign in with a shop account. You should reach the status screen showing the database open, the session live, and replication synced.

## Commands

| Command | What it does |
|---|---|
| `pnpm dev` | Dev server. No service worker (see below). |
| `pnpm test` | Vitest. Creates every RxDB collection under `fake-indexeddb` with dev-mode validation on. |
| `pnpm test:watch` | Same, watching. |
| `pnpm typecheck` | `tsc -b`. Strict mode is on. |
| `pnpm build` | Typecheck, then production build. |
| `pnpm verify` | Typecheck, tests, build. Run this before pushing. |
| `pnpm verify:rls` | Checks the RLS role split and policies against a live Supabase project. Needs `SUPABASE_DB_URL` (see setup step 3a). Not part of `pnpm verify` -- it needs a live database, and `pnpm verify` must stay runnable with no `.env` at all. |
| `VITE_PWA_DEV=1 pnpm dev` | Dev server *with* the service worker, for testing install and offline behaviour. |

CI runs `pnpm verify` on every push and pull request
(`.github/workflows/verify.yml`). `pnpm verify:rls` is not wired into CI since no workflow currently holds a `SUPABASE_DB_URL` secret -- run it manually against your project after any migration that touches RLS.

The service worker is off in development on purpose. It caches aggressively and produces stale-asset behaviour that reads as a code bug. Turn it on when you are specifically testing PWA behaviour, and expect to clear site data afterwards.

## Two things worth knowing before you change anything

**Dev and production do not run the same code.** RxDB's dev-mode and ajv-validation plugins are roughly 240 KB and are loaded behind `import.meta.env.DEV` so Rollup can prove them unreachable and drop them from the bundle. The consequence is that a schema mistake can fail loudly in `pnpm dev` and pass `vite build` in silence. That is not hypothetical -- the first scaffold shipped exactly that bug, declaring a `_modified` field RxDB rejects. `src/db/database.test.ts` exists to catch its return, and `pnpm verify` runs the tests before the build for the same reason.

**`_modified` and `_deleted` are Postgres columns only, never RxDB schema fields.** The full reasoning is in the header of [`src/db/schema.ts`](src/db/schema.ts). If you are adding a synced table, copy an existing collection rather than the Postgres DDL.

## Project layout

```
src/
  app.tsx                Root: open database -> establish session -> replication -> staff gate
  components/
    ui.tsx               Shared primitives, sized for one-handed phone use
    TabBar.tsx           Bottom navigation
    SyncBadge.tsx        Sync state, always visible
  db/
    schema.ts            RxDB collection schemas, mirroring the Postgres tables
    database.ts          RxDB singleton, dev-mode wiring, migration strategies
    replication.ts       Supabase sync (starts once a shop is logged in)
    balances.ts          Order balances, computed locally -- not from the view
    writes.ts            Every mutation the app makes, in one place
  dev/
    seed.ts              Fixture shop. Dev-only, refuses when Supabase is set
    DevTools.tsx         Seed button. Compiled out of production
  hooks/                 useAuth, useDatabase, useReplication, useRxQuery, useOnline
  lib/
    auth.ts              Shop-level session state machine
    supabaseClient.ts    Lazily constructed Supabase client
    pin.ts               PBKDF2 staff PIN hashing
    money.ts, dates.ts   Formatting and due-date arithmetic
    whatsapp.ts          wa.me link and message building
    backup.ts            JSON export
  screens/
    Shell.tsx            Routed shell
    Dashboard, Clients, ClientDetail, Orders, OrderForm, OrderDetail,
    Reports, Settings, StaffGate, Login, NotFound
    settings/            Shop, measurements, staff, backup
supabase/
  migrations/
    0001_init.sql        Schema, constraints, RLS policies, Realtime
```
