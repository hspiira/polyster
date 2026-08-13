import type { AppDatabase } from '../../db/database'
import {
  createClient,
  createMeasurementField,
  createOrder,
  createStaff,
  saveMeasurements,
  seedTenant,
  setFeatureEnabled,
  type ShopDoc,
} from './_fixture_helpers'

/* Edge-case fixture for local/offline testing: states the UI should handle
   without relying on online-only tables. */
export async function seedEdgeCaseTenant(db: AppDatabase): Promise<ShopDoc> {
  const shop = await seedTenant(db, {
    name: 'Ssenga Bridal & Tailoring',
    businessType: 'hybrid',
    ownerName: 'Rebecca Nabukenya',
    whatsappNumber: '+256701337204',
    email: 'bookings@ssengabridal.co.ug',
    featureOverrides: {
      rentals: false,
      catalogue: false,
      inventory: false,
      production: false,
      pre_orders: true,
      corporate_orders: true,
      collections: false,
      garment_identity: false,
      garment_passport: false,
      repairs: true,
    },
  })

  const ownerDoc = await db.staff.findOne({ selector: { shop_id: shop.id, role: 'owner' } }).exec()
  if (!ownerDoc) throw new Error('Seed owner was not created.')
  const owner = ownerDoc.toJSON()
  await createStaff(db, shop.id, {
    name: 'Irene Nampijja',
    pin: '123456',
    role: 'manager',
  })
  const inactive = await createStaff(db, shop.id, {
    name: 'Moses Kigozi',
    role: 'staff',
  })
  const inactiveDoc = await db.staff.findOne(inactive.id).exec()
  await inactiveDoc?.patch({
    active: false,
    deactivated_at: '2026-08-01T09:00:00.000Z',
    updated_at: '2026-08-01T09:00:00.000Z',
  })

  const chest = await createMeasurementField(db, shop.id, {
    label: 'Chest',
    unit: 'cm',
    display_order: 0,
  })
  const client = await createClient(db, shop.id, {
    name: 'Esther Kirabo',
    phone: '+256 772 845 190',
    notes: 'Bridesmaid dresses in March. Wants the same tailor each time.',
  })
  await saveMeasurements(db, client.id, {
    [chest.id]: 96,
  }, owner.id)

  // Historical order remains valid even though an unrelated optional module
  // is disabled.
  const historical = await createOrder(db, shop.id, {
    client_id: client.id,
    order_type: 'tailor_made',
    item_description: 'Navy wool blazer, single-breasted',
    price_total_minor: 410000,
    pickup_due_date: '2026-07-20',
  }, owner.id)

  const historicalDoc = await db.orders.findOne(historical.id).exec()
  await historicalDoc?.patch({
    stage: 'picked_up',
    picked_up_at: '2026-07-20T15:00:00.000Z',
    updated_at: '2026-07-20T15:00:00.000Z',
  })

  // A feature override explicitly disabled after historical data exists.
  await setFeatureEnabled(db, shop.id, 'production', false)
  await setFeatureEnabled(db, shop.id, 'collections', false)
  await setFeatureEnabled(db, shop.id, 'garment_identity', false)
  await setFeatureEnabled(db, shop.id, 'garment_passport', false)

  return shop
}
