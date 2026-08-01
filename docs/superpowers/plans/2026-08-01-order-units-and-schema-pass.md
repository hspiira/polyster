# Order Units and Schema Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn a flat order into a header plus priced, measured child units, and close the schema gaps found across every table.

**Architecture:** `orders` keeps stage, dates and client; a new `order_units` table carries per-garment description, wearer, price, fabric source and a frozen measurement snapshot. `orders.price_total_minor` and `orders.summary` become caches rebuilt only by `recalculateOrder()` in `writes.ts`, because RxDB has no join and the Orders list must render without loading child rows. Money moves to integer minor units end to end.

**Tech Stack:** Preact, RxDB 17 + Dexie storage, Supabase Postgres, TypeScript, Vitest.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-01-order-units-and-schema-pass-design.md`. Model (normative for schema): `docs/superpowers/specs/2026-08-01-order-units-and-schema-pass-model.md`.
- Never declare `_modified` in an RxDB schema. RxDB rejects underscore-prefixed fields and only in dev-mode, so it breaks `pnpm dev` while `vite build` passes. See the header of `src/db/schema.ts`.
- Bumping a `version` in `schema.ts` requires the matching entry in `migrationStrategies` in `src/db/database.ts` **in the same commit**. The key is the version being migrated *to*.
- Every money column and field is named with a `_minor` suffix and holds an integer.
- Every new Postgres table needs: `_modified` + `_deleted` columns, a `set_modified()` or `set_modified_and_updated_at()` trigger, an RLS policy naming `to authenticated` and wrapping `current_shop_id()` in `(select ...)`, and an entry in the `supabase_realtime` publication.
- Verification command for every task: `pnpm verify` (runs `tsc -b && vitest run && vite build`).
- Comments: 1-2 lines maximum on new code. Longer rationale belongs in the spec.
- Commits: no Claude or AI co-authorship trailers.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `src/lib/money.ts` | Currency exponent, minor-unit conversion, formatting, parsing | 1 |
| `src/lib/orderReference.ts` (new) | `DDMM-XXXXX` reference generation | 2 |
| `supabase/migrations/0005_order_units_and_schema_pass.sql` (new) | The whole server-side change | 3 |
| `src/db/schema.ts` | RxDB document types and schemas | 4 |
| `src/db/database.ts` | Collection registration and migration strategies | 4 |
| `src/db/replication.ts` | `REPLICATED_TABLES` | 4 |
| `src/db/writes.ts` | Every write, including `recalculateOrder` | 5, 6, 7, 8 |
| `src/db/backfill.ts` (new) | One-shot local unit repair after `addCollections` | 9 |
| `src/db/balances.ts` | Balance from integer payments minus refunds | 6 |
| `src/screens/OrderForm.tsx` | Header plus unit editor, same-day prompt | 10 |
| `src/screens/OrderDetail.tsx` | Unit list, money block, reminder line | 10 |
| `src/screens/ClientDetail.tsx` | Active fields for entry, retired read-only | 10 |

---

### Task 1: Minor-unit money primitives

Additive only. Existing `formatMoney`/`parseMoney` keep working so nothing else breaks yet.

**Files:**
- Modify: `src/lib/money.ts`
- Test: `src/lib/money.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `currencyExponent(currency: string): number`, `toMinorUnits(amount: number, currency: string): number`, `fromMinorUnits(minor: number, currency: string): number`, `formatMinor(minor: number, currency: string): string`, `parseToMinor(input: string, currency: string): number | null`, `DEFAULT_CURRENCY: 'UGX'`.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/money.test.ts`:

```ts
import {
  currencyExponent,
  toMinorUnits,
  fromMinorUnits,
  formatMinor,
  parseToMinor,
} from './money'

describe('minor units', () => {
  // If this fails, ICU on this platform disagrees with ISO 4217 for UGX and
  // currencyExponent needs the explicit fallback map. See spec section 9.
  it('reports UGX as a zero-decimal currency and KES as two', () => {
    expect(currencyExponent('UGX')).toBe(0)
    expect(currencyExponent('KES')).toBe(2)
  })

  it('round-trips through minor units at both exponents', () => {
    expect(toMinorUnits(45000, 'UGX')).toBe(45000)
    expect(fromMinorUnits(45000, 'UGX')).toBe(45000)
    expect(toMinorUnits(45000, 'KES')).toBe(4500000)
    expect(fromMinorUnits(4500000, 'KES')).toBe(45000)
  })

  it('rounds to the currency, never leaving a fraction of a minor unit', () => {
    expect(toMinorUnits(45000.6, 'UGX')).toBe(45001)
    expect(toMinorUnits(45.005, 'KES')).toBe(4501)
  })

  it('parses what a shop owner types, in minor units', () => {
    expect(parseToMinor('45,000', 'UGX')).toBe(45000)
    expect(parseToMinor(' 45 000 ', 'UGX')).toBe(45000)
    expect(parseToMinor('45.50', 'KES')).toBe(4550)
    expect(parseToMinor('', 'UGX')).toBeNull()
    expect(parseToMinor('-1', 'UGX')).toBeNull()
    expect(parseToMinor('abc', 'UGX')).toBeNull()
  })

  it('formats from minor units', () => {
    expect(formatMinor(45000, 'UGX')).toContain('45,000')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/money.test.ts`
Expected: FAIL, `currencyExponent is not a function`.

- [ ] **Step 3: Write minimal implementation**

Append to `src/lib/money.ts`:

```ts
export const DEFAULT_CURRENCY = 'UGX'

const exponentCache = new Map<string, number>()

/** Decimal places for a currency, from ICU rather than a hand-maintained table. */
export function currencyExponent(currency: string): number {
  const cached = exponentCache.get(currency)
  if (cached !== undefined) return cached

  const resolved = new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency,
  }).resolvedOptions().maximumFractionDigits

  exponentCache.set(currency, resolved)
  return resolved
}

export function toMinorUnits(amount: number, currency: string): number {
  return Math.round(amount * 10 ** currencyExponent(currency))
}

export function fromMinorUnits(minor: number, currency: string): number {
  return minor / 10 ** currencyExponent(currency)
}

export function formatMinor(minor: number, currency: string): string {
  const exponent = currencyExponent(currency)
  return new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: exponent,
  }).format(fromMinorUnits(minor, currency))
}

export function parseToMinor(input: string, currency: string): number | null {
  const cleaned = input.replace(/[\s,]/g, '')
  if (cleaned === '') return null

  const value = Number(cleaned)
  if (!Number.isFinite(value) || value < 0) return null

  return toMinorUnits(value, currency)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/lib/money.test.ts`
Expected: PASS.

If the UGX assertion fails, stop and replace the `currencyExponent` body with an explicit map (`UGX: 0, KES: 2, USD: 2`) defaulting to 2, keep the test asserting 0, and note the platform in the commit message. Do not proceed with a currency whose exponent is unknown.

- [ ] **Step 5: Commit**

```bash
git add src/lib/money.ts src/lib/money.test.ts
git commit -m "feat(money): minor-unit conversion and per-currency formatting"
```

---

### Task 2: Order reference generator

**Files:**
- Create: `src/lib/orderReference.ts`
- Test: `src/lib/orderReference.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `generateOrderReference(now?: Date): string`, `REFERENCE_ALPHABET: string`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/orderReference.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { generateOrderReference, REFERENCE_ALPHABET } from './orderReference'

describe('generateOrderReference', () => {
  it('is DDMM then five characters', () => {
    const ref = generateOrderReference(new Date('2026-08-12T09:00:00Z'))
    expect(ref).toMatch(/^1208-[0-9A-Z]{5}$/)
  })

  it('zero-pads single-digit days and months', () => {
    expect(generateOrderReference(new Date('2026-01-05T09:00:00Z')).slice(0, 4)).toBe('0501')
  })

  // Crockford base32: no I, L, O or U, so nothing is misread off a paper ticket.
  it('excludes the ambiguous letters', () => {
    expect(REFERENCE_ALPHABET).toHaveLength(32)
    for (const letter of ['I', 'L', 'O', 'U']) {
      expect(REFERENCE_ALPHABET).not.toContain(letter)
    }
  })

  it('uses only alphabet characters in the suffix', () => {
    for (let i = 0; i < 200; i++) {
      const suffix = generateOrderReference().slice(5)
      for (const char of suffix) expect(REFERENCE_ALPHABET).toContain(char)
    }
  })

  it('does not repeat within a reasonable sample', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 500; i++) seen.add(generateOrderReference())
    expect(seen.size).toBe(500)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/orderReference.test.ts`
Expected: FAIL, cannot resolve `./orderReference`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/orderReference.ts`:

```ts
/**
 * Human-readable order reference, generated on the device so it works offline.
 * Indexed but not unique: a rejected replication push is worse than a rare
 * duplicate display code. See spec decision O8.
 */

/** Crockford base32, without I, L, O and U. */
export const REFERENCE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

const SUFFIX_LENGTH = 5

function pad2(value: number): string {
  return value.toString().padStart(2, '0')
}

export function generateOrderReference(now: Date = new Date()): string {
  const prefix = pad2(now.getUTCDate()) + pad2(now.getUTCMonth() + 1)

  const bytes = crypto.getRandomValues(new Uint8Array(SUFFIX_LENGTH))
  let suffix = ''
  for (const byte of bytes) suffix += REFERENCE_ALPHABET[byte % REFERENCE_ALPHABET.length]

  return `${prefix}-${suffix}`
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/lib/orderReference.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/orderReference.ts src/lib/orderReference.test.ts
git commit -m "feat(orders): device-generated order reference"
```

---

### Task 3: Postgres migration 0005

No app code. This is the server half, written and reviewed before the client half depends on it.

**Files:**
- Create: `supabase/migrations/0005_order_units_and_schema_pass.sql`

**Interfaces:**
- Consumes: `set_modified()`, `set_modified_and_updated_at()`, `current_shop_id()` from `0001_init.sql`.
- Produces: tables `order_units`, `message_log`; columns named in the model document; the rewritten `order_balances` view.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0005_order_units_and_schema_pass.sql`. Follow the model document section by section. Order of statements matters:

```sql
-- 1. New columns on existing tables, all nullable or defaulted so no row fails.
alter table shops
  add column updated_at timestamptz not null default now(),
  add column currency text not null default 'UGX',
  add column country text not null default 'UG',
  add column address text,
  add column lock_after_minutes integer not null default 5
    check (lock_after_minutes >= 0);

drop trigger trg_shops_modified on shops;
create trigger trg_shops_modified
  before insert or update on shops
  for each row execute function set_modified_and_updated_at();

alter table staff
  add column updated_at timestamptz not null default now(),
  add column phone text,
  add column pin_updated_at timestamptz,
  add column deactivated_at timestamptz;

drop trigger trg_staff_modified on staff;
create trigger trg_staff_modified
  before insert or update on staff
  for each row execute function set_modified_and_updated_at();

alter table clients
  add column updated_at timestamptz not null default now(),
  add column created_by uuid references staff(id) on delete set null;

drop trigger trg_clients_modified on clients;
create trigger trg_clients_modified
  before insert or update on clients
  for each row execute function set_modified_and_updated_at();

create index idx_clients_shop_phone on clients(shop_id, phone);

alter table measurement_fields
  add column created_at timestamptz not null default now(),
  add column updated_at timestamptz not null default now(),
  add column field_type text not null default 'number'
    check (field_type in ('number', 'text')),
  add column group_label text,
  add column active boolean not null default true;

drop trigger trg_measurement_fields_modified on measurement_fields;
create trigger trg_measurement_fields_modified
  before insert or update on measurement_fields
  for each row execute function set_modified_and_updated_at();

alter table measurement_profiles
  add column created_at timestamptz not null default now();

alter table payments
  add column kind text not null default 'payment'
    check (kind in ('payment', 'refund')),
  add column created_at timestamptz not null default now(),
  add column reference text,
  add column voided_by uuid references staff(id) on delete set null,
  add column voided_at timestamptz,
  add column void_reason text;

alter table order_stage_history
  add column note text;
```

```sql
-- 2. Orders: rename, new columns, widened stage.
alter table orders rename column item_description to summary;

alter table orders
  add column reference text,
  add column currency text not null default 'UGX',
  add column price_adjustment_minor bigint not null default 0,
  add column adjustment_reason text,
  add column rental_deposit_minor bigint not null default 0
    check (rental_deposit_minor >= 0),
  add column deposit_refunded_at timestamptz,
  add column picked_up_at timestamptz,
  add column returned_at timestamptz,
  add column cancelled_at timestamptz,
  add column cancellation_reason text;

alter table orders drop constraint orders_stage_check;
alter table orders add constraint orders_stage_check
  check (stage in ('measured', 'in_progress', 'ready', 'picked_up', 'returned', 'cancelled'));

alter table order_stage_history drop constraint order_stage_history_from_stage_check;
alter table order_stage_history drop constraint order_stage_history_to_stage_check;
alter table order_stage_history add constraint order_stage_history_from_stage_check
  check (from_stage in ('measured','in_progress','ready','picked_up','returned','cancelled'));
alter table order_stage_history add constraint order_stage_history_to_stage_check
  check (to_stage in ('measured','in_progress','ready','picked_up','returned','cancelled'));
```

Verify the two constraint names first with `\d order_stage_history` in psql. Postgres auto-names them `<table>_<column>_check`, but confirm rather than assume.

```sql
-- 3. New tables. Full DDL, RLS and triggers are in the model document
--    sections 3 and 4 -- copy them verbatim.
```

```sql
-- 4. Backfill. The unit reuses the order's id as its primary key so the
--    device-side repair in Task 9 cannot create a duplicate.
insert into order_units (id, order_id, position, item_description, price_minor, created_at, updated_at)
select o.id, o.id, 0, o.summary, round(o.price_total)::bigint, o.created_at, o.updated_at
from orders o
where o._deleted = false;

-- References: DDMM from the row's own created_at, plus a random suffix drawn
-- from the same alphabet the app uses (no I, L, O, U).
update orders set reference =
  to_char(created_at, 'DDMM') || '-' ||
  (select string_agg(substr('0123456789ABCDEFGHJKMNPQRSTVWXYZ',
                            1 + floor(random() * 32)::int, 1), '')
   from generate_series(1, 5))
where reference is null;

alter table orders alter column reference set not null;
```

```sql
-- 5. Money to minor units. Safe as a plain round() only because every existing
--    row is UGX (exponent 0). Loses at most 0.99 UGX per row -- see spec.
alter table orders add column price_total_minor bigint not null default 0;
update orders set price_total_minor = round(price_total)::bigint;
alter table orders add constraint orders_price_total_minor_check
  check (price_total_minor >= 0);
alter table orders drop column price_total;

alter table payments add column amount_minor bigint;
update payments set amount_minor = round(amount)::bigint;
alter table payments alter column amount_minor set not null;
alter table payments add constraint payments_amount_minor_check check (amount_minor > 0);
alter table payments drop column amount;
```

```sql
-- 6. Replace the view (full text in model document section 8), then:
alter publication supabase_realtime add table order_units, message_log;
```

- [ ] **Step 2: Apply it to a scratch project and verify**

Run against a development Supabase project, then check each assertion:

```sql
-- Every non-deleted order got exactly one unit, with the order's own id.
select count(*) from orders o where o._deleted = false
  and not exists (select 1 from order_units u where u.id = o.id);
-- expect 0

-- No order lost its money.
select count(*) from orders where price_total_minor < 0;  -- expect 0

-- Every order has a reference of the right shape.
select count(*) from orders where reference !~ '^[0-9]{4}-[0-9A-Z]{5}$';  -- expect 0

-- The view still hides other shops' rows. Log in as shop A with shop B data
-- present, then:
select count(distinct shop_id) from order_balances;  -- expect 1
```

That last one is the ARCHITECTURE section 4 rule 2 check. `security_invoker = on` is the single easiest way to open a tenant-isolation hole in this design, and replacing the view is exactly when it gets dropped by accident.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0005_order_units_and_schema_pass.sql
git commit -m "feat(db): order_units, message_log, and the schema pass migration"
```

---

### Task 4: RxDB schemas, collections and migration strategies

The client half of Task 3. Mechanical call-site updates are included so the build stays green; behaviour is unchanged, with `createOrder` writing exactly one unit as it effectively does today.

**Files:**
- Modify: `src/db/schema.ts`, `src/db/database.ts`, `src/db/replication.ts`, `src/db/writes.ts`, `src/db/balances.ts`, `src/lib/whatsapp.ts`, and every screen listed in the blast radius below.
- Test: `src/db/database.test.ts`

**Interfaces:**
- Consumes: `generateOrderReference` (Task 2), `DEFAULT_CURRENCY` (Task 1).
- Produces: `OrderUnitDoc`, `orderUnitSchema`, `MessageLogDoc`, `messageLogSchema`, `FabricSource`, `PaymentKind`, `MessageTemplate`; `OrderStage` gains `'cancelled'`; `OrderDoc.item_description` becomes `summary`; `OrderDoc.price_total` becomes `price_total_minor`; `PaymentDoc.amount` becomes `amount_minor`.

Blast radius, from `grep`. Every one of these references a renamed field and must be updated in this task:

```
price_total      balances.ts balances.test.ts database.test.ts schema.ts writes.ts
                 whatsapp.test.ts ClientDetail.tsx OrderDetail.tsx OrderForm.tsx
                 today/todayModel.test.ts
item_description schema.ts writes.ts whatsapp.ts whatsapp.test.ts database.test.ts
                 ClientDetail.tsx OrderDetail.tsx OrderForm.tsx Orders.tsx
                 today/Today.tsx today/todayModel.test.ts
.amount          balances.ts balances.test.ts writes.ts OrderDetail.tsx Reports.tsx
```

- [ ] **Step 1: Write the failing test**

Add to `src/db/database.test.ts` inside the `describe('database', ...)` block:

```ts
it('accepts an order unit and rejects a negative price', async () => {
  const db = await freshDatabase()
  const now = new Date().toISOString()
  const orderId = crypto.randomUUID()

  await db.order_units.insert({
    id: crypto.randomUUID(),
    order_id: orderId,
    position: 0,
    item_description: 'Kanzu, navy',
    price_minor: 45000,
    measurements: { chest: 72 },
    fabric_source: 'client',
    done: false,
    created_at: now,
    updated_at: now,
  })

  expect(await db.order_units.count().exec()).toBe(1)

  await expect(
    db.order_units.insert({
      id: crypto.randomUUID(),
      order_id: orderId,
      position: 1,
      item_description: 'Negative',
      price_minor: -1,
      measurements: {},
      fabric_source: 'shop',
      done: false,
      created_at: now,
      updated_at: now,
    }),
  ).rejects.toThrow()
})

it('accepts cancelled as an order stage', async () => {
  const db = await freshDatabase()
  const now = new Date().toISOString()

  await db.orders.insert({
    id: crypto.randomUUID(),
    shop_id: crypto.randomUUID(),
    client_id: crypto.randomUUID(),
    order_type: 'tailor_made',
    reference: '1208-K7M2Q',
    currency: 'UGX',
    summary: 'Kanzu +2',
    stage: 'cancelled',
    price_total_minor: 150000,
    price_adjustment_minor: -5000,
    rental_deposit_minor: 0,
    pickup_due_date: '2026-08-12',
    created_at: now,
    updated_at: now,
  })

  expect(await db.orders.count().exec()).toBe(1)
})

it('rejects a refund with a non-positive amount', async () => {
  const db = await freshDatabase()

  await expect(
    db.payments.insert({
      id: crypto.randomUUID(),
      order_id: crypto.randomUUID(),
      amount_minor: 0,
      kind: 'refund',
      payment_date: new Date().toISOString(),
      created_at: new Date().toISOString(),
      method: 'cash',
    }),
  ).rejects.toThrow()
})
```

Also update the two existing order tests and the payment test in this file to the new field names, and add `'order_units'` and `'message_log'` to whatever `REPLICATED_TABLES` assertions compare against.

Then add the test the spec asks for, which the existing `describe('schema migration')` block only covers with a throwaway widget collection. This one exercises the **real** orders strategy, which is the one that carries a shop's money across the rename:

```ts
it('carries a real v0 order across the money and summary rename', async () => {
  const name = `orders_migration_${Date.now()}_${Math.random().toString(36).slice(2)}`

  // v0 shape: item_description and a decimal price_total.
  const before = await open(name)
  await before.addCollections({
    orders: { schema: ordersSchemaV0, migrationStrategies: {} },
  })
  await before.collections.orders?.insert({
    id: 'o1',
    shop_id: crypto.randomUUID(),
    client_id: crypto.randomUUID(),
    order_type: 'tailor_made',
    item_description: 'Kanzu, navy',
    stage: 'measured',
    price_total: 45000,
    pickup_due_date: '2026-08-12',
    created_at: '2026-08-01T09:00:00.000Z',
    updated_at: '2026-08-01T09:00:00.000Z',
  })
  await before.close()

  const after = await open(name)
  await after.addCollections({ orders: { schema: orderSchema, migrationStrategies: ordersStrategies } })

  const migrated = await after.collections.orders?.findOne('o1').exec()
  expect(migrated?.toJSON()).toMatchObject({
    summary: 'Kanzu, navy',
    price_total_minor: 45000,
    price_adjustment_minor: 0,
    currency: 'UGX',
  })
  expect(migrated?.toJSON()).not.toHaveProperty('price_total')
  expect(migrated?.get('reference')).toMatch(/^0108-[0-9A-Z]{5}$/)

  await after.remove()
})
```

Copy the pre-change `orderSchema` into the test file as `ordersSchemaV0` rather than importing it; the point is to pin the old shape so it cannot drift with the source. Export the strategy map from `database.ts` as `ordersStrategies` so the test exercises the shipped one rather than a copy.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/db/database.test.ts`
Expected: FAIL, `db.order_units` is undefined.

- [ ] **Step 3: Add the schemas**

In `src/db/schema.ts`, following the model document section 6. Add `'cancelled'` to `ORDER_STAGES`. Money fields use `{ type: 'integer' }`:

```ts
export type FabricSource = 'client' | 'shop'
export const FABRIC_SOURCES: readonly FabricSource[] = ['client', 'shop']

export interface OrderUnitDoc {
  id: string
  order_id: string
  position: number
  wearer_name?: string
  item_description: string
  price_minor: number
  measurements: Record<string, string | number>
  fabric_source: FabricSource
  done: boolean
  catalogue_item_id?: string
  photo_url?: string
  notes?: string
  created_at: string
  updated_at: string
}

export const orderUnitSchema: RxJsonSchema<OrderUnitDoc> = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: uuidField,
    order_id: uuidField,
    position: { type: 'number' },
    wearer_name: { type: 'string' },
    item_description: { type: 'string' },
    price_minor: { type: 'integer', minimum: 0 },
    measurements: { type: 'object', additionalProperties: true },
    fabric_source: { type: 'string', enum: [...FABRIC_SOURCES] },
    done: { type: 'boolean' },
    catalogue_item_id: uuidField,
    photo_url: { type: 'string' },
    notes: { type: 'string' },
    created_at: { type: 'string', format: 'date-time' },
    updated_at: { type: 'string', format: 'date-time' },
  },
  required: [
    'id', 'order_id', 'position', 'item_description',
    'price_minor', 'fabric_source', 'done',
  ],
  indexes: ['order_id'],
}
```

Add `MessageLogDoc` / `messageLogSchema` the same way, per model section 4, with `indexes: ['order_id', 'client_id']`.

Then add the new fields to **every existing schema and interface**, per model section 5. None of these are optional and each drives a version bump:

| Schema | Version | New fields |
|---|---|---|
| `shopSchema` | 1 → 2 | `updated_at`, `currency`, `country`, `address`, `lock_after_minutes` |
| `staffSchema` | 2 → 3 | `updated_at`, `phone`, `pin_updated_at`, `deactivated_at` |
| `clientSchema` | 0 → 1 | `updated_at`, `created_by` |
| `measurementFieldSchema` | 0 → 1 | `created_at`, `updated_at`, `field_type`, `group_label`, `active` |
| `measurementProfileSchema` | 0 → 1 | `created_at` |
| `orderSchema` | 0 → 1 | `reference`, `currency`, `price_adjustment_minor`, `adjustment_reason`, `rental_deposit_minor`, `deposit_refunded_at`, `picked_up_at`, `returned_at`, `cancelled_at`, `cancellation_reason`; renames `item_description` → `summary` and `price_total` → `price_total_minor`; drops `catalogue_item_id` |
| `paymentSchema` | 0 → 1 | `kind`, `created_at`, `reference`, `voided_by`, `voided_at`, `void_reason`; renames `amount` → `amount_minor` |
| `orderStageHistorySchema` | 0 → 1 | `note` |

`ORDER_STAGES` gains `'cancelled'`. The `stage` property keeps `maxLength: 20`, which still fits.

- [ ] **Step 4: Register the collections and write every migration strategy**

In `src/db/database.ts`, add both collections to `Collections`, add them to `addCollections`, and give every bumped collection a real strategy. The orders one is the substantial case:

```ts
orders: {
  schema: orderSchema, // version: 1
  migrationStrategies: {
    1: (doc: Record<string, unknown>) => {
      const { item_description, price_total, catalogue_item_id: _moved, ...rest } = doc
      return {
        ...rest,
        summary: (item_description as string) ?? '',
        price_total_minor: Math.round((price_total as number) ?? 0),
        price_adjustment_minor: 0,
        rental_deposit_minor: 0,
        currency: DEFAULT_CURRENCY,
        reference: generateOrderReference(new Date(rest.created_at as string)),
      }
    },
  },
},
payments: {
  schema: paymentSchema, // version: 1
  migrationStrategies: {
    1: (doc: Record<string, unknown>) => {
      const { amount, ...rest } = doc
      return {
        ...rest,
        amount_minor: Math.round((amount as number) ?? 0),
        kind: 'payment',
        created_at: (rest.payment_date as string) ?? new Date().toISOString(),
      }
    },
  },
},
```

`clients`, `staff`, `measurement_fields`, `measurement_profiles`, `order_stage_history` and `shops` each add a strategy supplying the new defaults (`active: true`, `field_type: 'number'`, `currency: DEFAULT_CURRENCY`, `country: 'UG'`, `lock_after_minutes: 5`, and so on). A strategy that only adds defaulted fields is still required; the version bump fails without it.

Add `'order_units'` and `'message_log'` to `REPLICATED_TABLES` in `src/db/replication.ts`.

- [ ] **Step 5: Update every call site in the blast radius**

Work through the grep list above. `pnpm typecheck` names each one. This is a rename, not a redesign: keep behaviour identical, converting at the boundary with `formatMinor(order.price_total_minor, order.currency)` where `formatMoney(order.price_total)` was.

`createOrder` writes exactly one unit, so the app behaves as it does today.

- [ ] **Step 6: Verify**

Run: `pnpm verify`
Expected: PASS, all three stages.

- [ ] **Step 7: Commit**

```bash
git add src/db src/lib/whatsapp.ts src/screens
git commit -m "feat(db): order_units and message_log collections, money in minor units"
```

---

### Task 5: recalculateOrder and the unit write operations

**Files:**
- Modify: `src/db/writes.ts`
- Test: `src/db/writes.test.ts` (create)

**Interfaces:**
- Consumes: `AppDatabase`, `OrderUnitDoc`.
- Produces: `recalculateOrder(db, orderId): Promise<void>`, `addOrderUnit(db, orderId, input): Promise<OrderUnitDoc>`, `updateOrderUnit(db, unitId, input): Promise<void>`, `removeOrderUnit(db, unitId): Promise<void>`, `reorderOrderUnits(db, orderId, orderedIds): Promise<void>`, `setUnitDone(db, unitId, done): Promise<void>`, `setOrderAdjustment(db, orderId, minor, reason?): Promise<void>`, `buildSummary(descriptions: readonly string[]): string`.

`setOrderAdjustment` belongs here rather than with the cancellation work: it is one of the five writes that must funnel through `recalculateOrder`, and the invariant tests below call it.

- [ ] **Step 1: Write the failing test**

Create `src/db/writes.test.ts`. `buildSummary` is pure, so test it directly; the invariant needs a database.

```ts
import { describe, expect, it } from 'vitest'
import { buildSummary } from './writes'

describe('buildSummary', () => {
  // Invariant 3. Pinned exactly, because two call sites computing a cache
  // differently is the failure a cache invites.
  it('takes the first description up to its comma, plus a count', () => {
    expect(buildSummary(['Kanzu, navy', 'Gomesi, gold trim', 'Shirt, white'])).toBe('Kanzu +2')
    expect(buildSummary(['Kanzu, navy'])).toBe('Kanzu')
    expect(buildSummary(['Kanzu'])).toBe('Kanzu')
    expect(buildSummary([])).toBe('')
  })
})
```

Then the invariant, using the `freshDatabase` helper pattern from `database.test.ts`:

```ts
describe('recalculateOrder', () => {
  it('keeps price_total_minor equal to the units plus the adjustment', async () => {
    const { db, orderId } = await orderWithUnits([45000, 80000, 30000])
    await setOrderAdjustment(db, orderId, -5000, 'regular customer')

    const order = await db.orders.findOne(orderId).exec()
    expect(order?.price_total_minor).toBe(150000)
    expect(order?.summary).toBe('Kanzu +2')
  })

  it('recalculates after every unit operation', async () => {
    const { db, orderId, unitIds } = await orderWithUnits([45000, 80000, 30000])

    await updateOrderUnit(db, unitIds[1]!, { item_description: 'Gomesi', price_minor: 90000 })
    expect((await db.orders.findOne(orderId).exec())?.price_total_minor).toBe(165000)

    await removeOrderUnit(db, unitIds[2]!)
    expect((await db.orders.findOne(orderId).exec())?.price_total_minor).toBe(135000)
  })

  it('refuses to remove the last unit', async () => {
    const { db, unitIds } = await orderWithUnits([45000])
    await expect(removeOrderUnit(db, unitIds[0]!)).rejects.toThrow()
  })

  it('refuses an adjustment that would drive the total negative', async () => {
    const { db, orderId } = await orderWithUnits([45000])
    await expect(setOrderAdjustment(db, orderId, -50000, 'too much')).rejects.toThrow()
  })
})
```

Write `orderWithUnits(prices: number[])` as a local helper that creates a fresh database, inserts an order, then calls `addOrderUnit` once per price with descriptions `Kanzu, navy` / `Gomesi, gold trim` / `Shirt, white`, and returns `{ db, orderId, unitIds }`.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/db/writes.test.ts`
Expected: FAIL, `buildSummary` is not exported.

- [ ] **Step 3: Implement**

In `src/db/writes.ts`:

```ts
/** Invariant 3: first description up to its comma, plus a count of the rest. */
export function buildSummary(descriptions: readonly string[]): string {
  const [first, ...rest] = descriptions
  if (!first) return ''
  const head = first.split(',')[0]!.trim()
  return rest.length > 0 ? `${head} +${rest.length}` : head
}

/**
 * Rebuilds the caches on an order. The only thing permitted to set
 * price_total_minor or summary -- see spec invariant 1.
 */
export async function recalculateOrder(db: AppDatabase, orderId: string): Promise<void> {
  const order = await db.orders.findOne(orderId).exec()
  if (!order) throw new Error('That order no longer exists on this device.')

  const units = await db.order_units
    .find({ selector: { order_id: orderId }, sort: [{ position: 'asc' }] })
    .exec()

  const subtotal = units.reduce((sum, unit) => sum + unit.price_minor, 0)
  const total = subtotal + order.price_adjustment_minor

  if (total < 0) {
    throw new Error('That discount is larger than the order total.')
  }

  await order.patch({
    price_total_minor: total,
    summary: buildSummary(units.map((unit) => unit.item_description)),
    updated_at: now(),
  })
}
```

Then `addOrderUnit`, `updateOrderUnit`, `removeOrderUnit`, `reorderOrderUnits` and `setUnitDone`, each ending with `await recalculateOrder(db, orderId)`. `removeOrderUnit` counts first and throws `'An order needs at least one item.'` when the count is 1.

`setOrderAdjustment` must check **before** it patches:

```ts
export async function setOrderAdjustment(
  db: AppDatabase,
  orderId: string,
  minor: number,
  reason?: string,
): Promise<void> {
  const order = await db.orders.findOne(orderId).exec()
  if (!order) throw new Error('That order no longer exists on this device.')

  const units = await db.order_units.find({ selector: { order_id: orderId } }).exec()
  const subtotal = units.reduce((sum, unit) => sum + unit.price_minor, 0)

  // Checked here, not left to recalculateOrder. Patching first and letting the
  // recalculation throw would persist the adjustment while price_total_minor
  // still held the old figure, which is invariant 1 broken on disk.
  if (subtotal + minor < 0) throw new Error('That discount is larger than the order total.')

  await order.patch({ price_adjustment_minor: minor, adjustment_reason: reason || undefined })
  await recalculateOrder(db, orderId)
}
```

`recalculateOrder` keeps its own `total < 0` throw as a backstop for any path that changes unit prices under an existing adjustment.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/db/writes.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/db/writes.ts src/db/writes.test.ts
git commit -m "feat(orders): unit write operations behind a single recalculation"
```

---

### Task 6: Adjustment, cancellation, refunds, and balances

**Files:**
- Modify: `src/db/writes.ts`, `src/db/balances.ts`
- Test: `src/db/balances.test.ts`, `src/db/writes.test.ts`

**Interfaces:**
- Consumes: `recalculateOrder`, `setOrderAdjustment` (both Task 5).
- Produces: `cancelOrder(db, orderId, reason, staffId?): Promise<void>`; `calculateBalance` changes to take `Pick<OrderDoc, 'id' | 'price_total_minor'>` and `readonly Pick<PaymentDoc, 'amount_minor' | 'kind'>[]`, returning `OrderBalance` with `price_total_minor`, `amount_paid_minor`, `balance_minor`, `fully_paid`.

Renaming the `OrderBalance` properties breaks every consumer. `grep -rn "\.balance\b\|amount_paid\|fully_paid" src` before starting; at minimum it reaches `OrderDetail.tsx`, `Reports.tsx`, `today/todayModel.ts` and `today/todayModel.test.ts`. All are updated in this task, not left for Task 10.

- [ ] **Step 1: Write the failing test**

In `src/db/balances.test.ts`, replace the decimal fixtures and add:

```ts
it('subtracts refunds from the amount paid', () => {
  const balance = calculateBalance(
    { id: 'o1', price_total_minor: 150000 },
    [
      { amount_minor: 100000, kind: 'payment' },
      { amount_minor: 20000, kind: 'refund' },
    ],
  )
  expect(balance.amount_paid_minor).toBe(80000)
  expect(balance.balance_minor).toBe(70000)
  expect(balance.fully_paid).toBe(false)
})

it('never counts a rental deposit as payment', () => {
  // rental_deposit_minor is not an input to this function at all. If it ever
  // becomes one, this test should be deleted deliberately, not quietly.
  const balance = calculateBalance({ id: 'o1', price_total_minor: 100000 }, [
    { amount_minor: 100000, kind: 'payment' },
  ])
  expect(balance.fully_paid).toBe(true)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/db/balances.test.ts`
Expected: FAIL on the property names.

- [ ] **Step 3: Implement**

Rewrite `calculateBalance` to sum integers with no conversion, treating `kind === 'refund'` as negative. Delete `toMinorUnits`/`fromMinorUnits` from `balances.ts` entirely; they are Task 1's job now and this module no longer converts at all. Update `observeBalance` and `observeShopBalances` to the new field names.

Add `setOrderAdjustment` and `cancelOrder` to `writes.ts`. `cancelOrder` calls `changeOrderStage(db, orderId, 'cancelled', staffId)` and patches `cancelled_at` and `cancellation_reason`.

Extend `changeOrderStage` to stamp `picked_up_at`, `returned_at` or `cancelled_at` when entering the matching stage.

- [ ] **Step 4: Verify**

Run: `pnpm verify`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/db
git commit -m "feat(orders): adjustments, cancellation, refunds, integer balances"
```

---

### Task 7: Measurement snapshots and the retired-field fix

**Files:**
- Modify: `src/db/writes.ts`
- Test: `src/db/writes.test.ts`

**Interfaces:**
- Produces: `retireMeasurementField(db, fieldId): Promise<void>` replacing `removeMeasurementField`; `copyMeasurementsFromClient(db, unitId, clientId): Promise<void>`; `saveUnitMeasurementsToClient(db, unitId, clientId, staffId?): Promise<void>`.

- [ ] **Step 1: Write the failing test**

```ts
describe('measurement fields', () => {
  it('keeps a retired field queryable so recorded values still resolve', async () => {
    const db = await freshDatabase()
    const field = await createMeasurementField(db, shopId, { label: 'Chest', display_order: 0 })

    await retireMeasurementField(db, field.id)

    // The bug this replaces: doc.remove() soft-deletes, RxDB excludes
    // soft-deleted docs from queries, and every recorded chest measurement
    // becomes unlabellable.
    const found = await db.measurement_fields.findOne(field.id).exec()
    expect(found).not.toBeNull()
    expect(found?.active).toBe(false)
  })
})

describe('unit measurements', () => {
  it('does not change a unit snapshot when the client profile is later edited', async () => {
    const { db, clientId, unitId } = await unitWithMeasurements({ chest: 72 })
    await saveMeasurements(db, clientId, { chest: 99 })

    const unit = await db.order_units.findOne(unitId).exec()
    expect(unit?.measurements).toEqual({ chest: 72 })
  })
})
```

Both tests need helpers. Add them alongside `orderWithUnits` from Task 5:

```ts
const shopId = crypto.randomUUID()

/** An order with one unit carrying a measurement snapshot, and its client. */
async function unitWithMeasurements(measurements: Record<string, string | number>) {
  const { db, orderId } = await orderWithUnits([45000])
  const client = await createClient(db, shopId, { name: 'Mrs. Okello' })

  const units = await db.order_units.find({ selector: { order_id: orderId } }).exec()
  const unitId = units[0]!.id
  await updateOrderUnit(db, unitId, { measurements })

  return { db, clientId: client.id, unitId }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/db/writes.test.ts`
Expected: FAIL, `retireMeasurementField` is not exported.

- [ ] **Step 3: Implement**

Replace `removeMeasurementField` with `retireMeasurementField`, which patches `active: false` instead of calling `doc.remove()`. Add the two copy functions. Neither runs automatically.

Update `ClientDetail.tsx`'s field query to `selector: { active: { $ne: false } }` for the entry form, and render fields that are inactive but hold a value as read-only.

- [ ] **Step 4: Verify**

Run: `pnpm verify`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/db/writes.ts src/db/writes.test.ts src/screens/ClientDetail.tsx
git commit -m "fix(measurements): retiring a field no longer hides recorded values"
```

---

### Task 8: Message log

**Files:**
- Modify: `src/db/writes.ts`, `src/screens/OrderDetail.tsx`
- Test: `src/db/writes.test.ts`

**Interfaces:**
- Produces: `logMessage(db, input: { client_id: string; order_id?: string; template: MessageTemplate; order_stage?: OrderStage }, staffId?): Promise<void>`.

- [ ] **Step 1: Write the failing test**

```ts
it('records a sent reminder against the order and the client', async () => {
  const db = await freshDatabase()
  const clientId = crypto.randomUUID()
  const orderId = crypto.randomUUID()

  await logMessage(db, { client_id: clientId, order_id: orderId, template: 'balance_reminder' })

  const logged = await db.message_log.find({ selector: { order_id: orderId } }).exec()
  expect(logged).toHaveLength(1)
  expect(logged[0]?.channel).toBe('whatsapp')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/db/writes.test.ts`
Expected: FAIL, `logMessage` is not exported.

- [ ] **Step 3: Implement**

Add `logMessage` to `writes.ts`. Call it from the WhatsApp button in `OrderDetail.tsx` at the moment the `wa.me` link is opened.

The copy must read "Reminder sent" with the time and staff name, never "client notified". A `wa.me` link hands off to WhatsApp and the app never learns what happened next.

- [ ] **Step 4: Verify**

Run: `pnpm verify`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/db/writes.ts src/db/writes.test.ts src/screens/OrderDetail.tsx
git commit -m "feat(orders): record WhatsApp sends so staff can see a client was chased"
```

---

### Task 9: Local backfill repair

For a device holding orders created offline before this version, whose units the server backfill has not reached.

**Files:**
- Create: `src/db/backfill.ts`, `src/db/backfill.test.ts`
- Modify: `src/db/database.ts`

**Interfaces:**
- Produces: `backfillOrderUnits(db: AppDatabase): Promise<number>` returning how many units it created.

- [ ] **Step 1: Write the failing test**

```ts
it('creates one unit per order, using the order id as the unit id', async () => {
  const db = await freshDatabase()
  const orderId = await insertOrderWithoutUnits(db, { summary: 'Kanzu', price_total_minor: 45000 })

  expect(await backfillOrderUnits(db)).toBe(1)

  const unit = await db.order_units.findOne(orderId).exec()
  expect(unit?.order_id).toBe(orderId)
  expect(unit?.price_minor).toBe(45000)
})

it('is idempotent, and yields to a unit that arrived by replication', async () => {
  const db = await freshDatabase()
  await insertOrderWithoutUnits(db, { summary: 'Kanzu', price_total_minor: 45000 })

  await backfillOrderUnits(db)
  expect(await backfillOrderUnits(db)).toBe(0)
  expect(await db.order_units.count().exec()).toBe(1)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/db/backfill.test.ts`
Expected: FAIL, cannot resolve `./backfill`.

- [ ] **Step 3: Implement**

```ts
/**
 * Creates the missing unit for any order that has none. The unit takes the
 * order's own id, so this and the server-side backfill cannot both create one.
 */
export async function backfillOrderUnits(db: AppDatabase): Promise<number> {
  const orders = await db.orders.find().exec()
  let created = 0

  for (const order of orders) {
    const existing = await db.order_units.count({ selector: { order_id: order.id } }).exec()
    if (existing > 0) continue

    await db.order_units.insert({
      id: order.id,
      order_id: order.id,
      position: 0,
      item_description: order.summary || 'Item',
      price_minor: order.price_total_minor - order.price_adjustment_minor,
      measurements: {},
      fabric_source: 'shop',
      done: false,
      created_at: order.created_at,
      updated_at: order.updated_at,
    })
    created++
  }

  return created
}
```

Call it from `createDatabase` immediately after `addCollections` resolves.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/db/backfill.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/db/backfill.ts src/db/backfill.test.ts src/db/database.ts
git commit -m "feat(db): repair orders that predate order units"
```

---

### Task 10: Screens

Structure only. Visual and interaction design belongs to spec S2.

**Files:**
- Modify: `src/screens/OrderForm.tsx`, `src/screens/OrderDetail.tsx`, `src/screens/Settings.tsx`, and the shop details sub-screen.

**Interfaces:**
- Consumes: every write from Tasks 5 to 8, `formatMinor`/`parseToMinor` from Task 1.

- [ ] **Step 1: OrderForm becomes a header plus a unit editor**

Header holds client, order type, pickup and return dates, adjustment with its reason, and notes. Below it, a list of units, each with description, optional wearer name, price, fabric source, and a measurements block with the two named buttons from Task 7. An add and a remove control per unit; removal of the last one is refused by `removeOrderUnit` and the error is shown rather than swallowed.

- [ ] **Step 2: The same-day prompt**

On choosing a client, query for their open orders with the same `pickup_due_date`. If one exists, ask once: add to it, or start a separate order. Staff keep the final say, per decision O6.

The query, which is the non-obvious part:

```ts
const CLOSED_STAGES: readonly OrderStage[] = ['picked_up', 'returned', 'cancelled']

const openSameDay = await db.orders
  .find({
    selector: {
      client_id: clientId,
      pickup_due_date: pickupDueDate,
      stage: { $nin: [...CLOSED_STAGES] },
    },
  })
  .exec()
```

Ask only when `openSameDay.length > 0`, and ask once per client selection rather than on every keystroke. Choosing "add to it" navigates to that order's form with the existing units loaded; choosing "separate order" proceeds unchanged and must not ask again for the same selection.

- [ ] **Step 3: OrderDetail gains the units and the money block**

Unit list with per-unit done ticks calling `setUnitDone`. Money block showing subtotal, adjustment with reason, total, paid, balance as separate lines, and a rental deposit shown apart from the balance because it is held rather than earned.

- [ ] **Step 4: Settings**

Currency and lock timeout under shop details. Field type, group and retire under measurement fields, with retire wired to `retireMeasurementField`.

- [ ] **Step 5: Verify**

Run: `pnpm verify`
Expected: PASS.

Then drive the app at 390x844 and take one order with three units end to end: create, price, measure, pay partially, mark a unit done, advance the stage, send a reminder.

- [ ] **Step 6: Commit**

```bash
git add src/screens
git commit -m "feat(orders): unit editor, money block, and the same-day prompt"
```

---

## What this plan does not do

- **Conflict resolution stays untested** (ARCHITECTURE section 11), and this work widens the surface: two devices editing different units of one order both recalculate the total and will disagree. Invariant 1 makes the correct value recomputable from the units, so the repair is well defined, but it is not written here.
- **No real-hardware verification.** Task 1 step 4 is the first thing in this project that depends on device ICU data, and Task 10 step 5 is a desktop browser at phone dimensions. Both need a real handset before this ships.
- **`catalogue_item_id` and `photo_url` stay unwritten** on `order_units`, reserved for Phase 2.
