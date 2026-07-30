/**
 * Development fixtures (N5).
 *
 * Building the client and order screens against an empty database means
 * hand-entering data on every reload. This writes a realistic shop straight
 * into the local RxDB: clients, measurement fields, orders spread across every
 * stage and due-date bucket, and partial payments -- so the dashboard has
 * something to be wrong about.
 *
 * ## Safety
 *
 * This writes rows that look like real shop data. Two guards keep it out of a
 * real database, and both matter:
 *
 *  1. It refuses to run unless `import.meta.env.DEV`.
 *  2. It refuses to run when Supabase is configured, because replication would
 *     push every fixture row up to the real project.
 *
 * The second is the important one. A developer with a `.env` pointed at the
 * shop's live project is exactly the person who would run this by accident.
 */
import type { AppDatabase } from '../db/database'
import { isSupabaseConfigured } from '../lib/supabaseClient'
import { hashPin } from '../lib/pin'
import { addDays, today } from '../lib/dates'
import type {
  ClientDoc,
  MeasurementFieldDoc,
  OrderDoc,
  PaymentDoc,
  ShopDoc,
  StaffDoc,
} from '../db/schema'

/** Every seeded PIN, so the staff gate is usable without hunting for it. */
export const SEED_PIN = '1234'

export class SeedRefused extends Error {}

function id(): string {
  return crypto.randomUUID()
}

function guard(): void {
  if (!import.meta.env.DEV) {
    throw new SeedRefused('Seeding is only available in development.')
  }
  if (isSupabaseConfigured()) {
    throw new SeedRefused(
      'Refusing to seed: Supabase is configured, so replication would push this ' +
        'fixture data into the real project. Unset VITE_SUPABASE_URL to seed locally.',
    )
  }
}

export interface SeedResult {
  shop: ShopDoc
  staff: StaffDoc[]
  clients: ClientDoc[]
  orders: OrderDoc[]
}

/**
 * Populates an empty database. Does nothing if a shop already exists, so it is
 * safe to call on every startup.
 */
export async function seedIfEmpty(db: AppDatabase): Promise<SeedResult | null> {
  guard()
  const existing = await db.shops.findOne().exec()
  if (existing) return null
  return seed(db)
}

export async function seed(db: AppDatabase): Promise<SeedResult> {
  guard()

  const now = new Date().toISOString()
  const day = today()

  const shop: ShopDoc = {
    id: id(),
    name: 'Nakasero Tailors',
    whatsapp_number: '+256700000000',
    supabase_auth_user_id: id(),
    created_at: now,
  }
  await db.shops.insert(shop)

  const pinHash = await hashPin(SEED_PIN)
  const staff: StaffDoc[] = [
    { id: id(), shop_id: shop.id, name: 'Grace', pin_hash: pinHash, role: 'owner', active: true, created_at: now },
    { id: id(), shop_id: shop.id, name: 'Joseph', pin_hash: pinHash, role: 'staff', active: true, created_at: now },
  ]
  await db.staff.bulkInsert(staff)

  const fields: MeasurementFieldDoc[] = [
    { id: id(), shop_id: shop.id, label: 'Chest', unit: 'in', display_order: 0 },
    { id: id(), shop_id: shop.id, label: 'Waist', unit: 'in', display_order: 1 },
    { id: id(), shop_id: shop.id, label: 'Hip', unit: 'in', display_order: 2 },
    { id: id(), shop_id: shop.id, label: 'Sleeve length', unit: 'in', display_order: 3 },
  ]
  await db.measurement_fields.bulkInsert(fields)

  const clients: ClientDoc[] = [
    { id: id(), shop_id: shop.id, name: 'Amina Nakato', phone: '+256701234567', created_at: now },
    { id: id(), shop_id: shop.id, name: 'Brian Okello', phone: '0782345678', created_at: now },
    {
      id: id(),
      shop_id: shop.id,
      name: 'Christine Auma',
      phone: '+256753456789',
      notes: 'Prefers a looser fit through the shoulder.',
      created_at: now,
    },
    // No phone on purpose: the WhatsApp button has to degrade gracefully, and
    // that path is easy to forget to build without a client who exercises it.
    { id: id(), shop_id: shop.id, name: 'Daniel Ssemwogerere', created_at: now },
  ]
  await db.clients.bulkInsert(clients)

  await db.measurement_profiles.bulkInsert(
    clients.slice(0, 2).map((client, index) => ({
      id: id(),
      client_id: client.id,
      values: {
        [fields[0]!.id]: 38 + index,
        [fields[1]!.id]: 32 + index,
        [fields[2]!.id]: 40 + index,
        [fields[3]!.id]: 24,
      },
      updated_at: now,
      updated_by: staff[0]!.id,
    })),
  )

  // Spread across every stage and every due-date bucket, so the dashboard's
  // sections are all exercised rather than only the happy one.
  const orderSpecs = [
    { client: 0, type: 'tailor_made', item: 'Navy two-piece suit', price: 450000, due: addDays(day, -4), stage: 'ready' },
    { client: 1, type: 'tailor_made', item: 'White kanzu', price: 180000, due: day, stage: 'in_progress' },
    { client: 2, type: 'rental', item: 'Gomesi, deep red', price: 120000, due: addDays(day, 3), stage: 'measured', ret: addDays(day, 6) },
    { client: 0, type: 'purchase', item: 'Kitenge shirt, large', price: 75000, due: addDays(day, 12), stage: 'measured' },
    { client: 3, type: 'tailor_made', item: 'School uniform, 3 sets', price: 210000, due: addDays(day, -20), stage: 'picked_up' },
    { client: 1, type: 'rental', item: 'Black dinner jacket', price: 90000, due: addDays(day, -30), stage: 'returned', ret: addDays(day, -25) },
  ] as const

  const orders: OrderDoc[] = orderSpecs.map((spec) => ({
    id: id(),
    shop_id: shop.id,
    client_id: clients[spec.client]!.id,
    order_type: spec.type,
    item_description: spec.item,
    stage: spec.stage,
    price_total: spec.price,
    pickup_due_date: spec.due,
    created_at: now,
    updated_at: now,
    created_by: staff[spec.client % staff.length]!.id,
    ...('ret' in spec && spec.ret ? { return_due_date: spec.ret } : {}),
  }))
  await db.orders.bulkInsert(orders)

  await db.order_stage_history.bulkInsert(
    orders.map((order) => ({
      id: id(),
      order_id: order.id,
      to_stage: order.stage,
      changed_at: now,
      changed_by: order.created_by,
    })),
  )

  // A deliberate mix: fully paid, part paid, unpaid, and one collected order
  // still owing money -- which is the row the dashboard should be shouting
  // about.
  const payments: PaymentDoc[] = [
    { id: id(), order_id: orders[0]!.id, amount: 200000, payment_date: now, method: 'mobile_money', recorded_by: staff[0]!.id },
    { id: id(), order_id: orders[1]!.id, amount: 180000, payment_date: now, method: 'cash', recorded_by: staff[1]!.id },
    { id: id(), order_id: orders[2]!.id, amount: 50000, payment_date: now, method: 'cash', recorded_by: staff[0]!.id },
    { id: id(), order_id: orders[4]!.id, amount: 100000, payment_date: now, method: 'bank', recorded_by: staff[0]!.id },
    { id: id(), order_id: orders[5]!.id, amount: 90000, payment_date: now, method: 'cash', recorded_by: staff[1]!.id },
  ]
  await db.payments.bulkInsert(payments)

  return { shop, staff, clients, orders }
}
