import type { AppDatabase } from '../../db/database'
import {
  changeOrderStage,
  createClient,
  createMeasurementField,
  createOrder,
  createStaff,
  logMessage,
  recordExpense,
  recordPayment,
  recordSale,
  saveMeasurements,
  seedTenant,
  type ShopDoc,
} from './_fixture_helpers'
import { seedVolume, type VolumeCatalogue } from './volume'

/**
 * Generic tailoring-shop fixture.
 *
 * Deliberately does not enable NORTH//FOUND-style catalogue, production,
 * collections, garment identity or passport features.
 *
 * Default test PIN for all seeded staff: 123456
 */
const MIREMBE_CATALOGUE: VolumeCatalogue = {
  garments: [
    { item: 'Two-piece suit, navy', price: 450000, type: 'tailor_made' },
    { item: 'Kanzu, white cotton', price: 130000, type: 'tailor_made' },
    { item: 'Office shirt, long sleeve', price: 55000, type: 'tailor_made' },
    { item: 'Kitenge dress', price: 165000, type: 'tailor_made' },
    { item: 'School uniform set', price: 45000, type: 'purchase' },
    { item: 'Blazer, grey wool', price: 320000, type: 'tailor_made' },
    { item: 'Trouser taken in at the waist', price: 15000, type: 'repair' },
    { item: 'Zip replaced on a jacket', price: 20000, type: 'repair' },
  ],
  retail: [
    { item: 'Kitenge fabric, 6 yards', price: 90000 },
    { item: 'Shirt buttons, card', price: 5000 },
    { item: 'Ready-made kanzu', price: 120000 },
    { item: 'Necktie', price: 35000 },
    { item: 'Sewing thread, box', price: 18000 },
  ],
  expenses: [
    { category: 'materials', description: 'Suiting fabric, 30m', amount: 840000 },
    { category: 'rent', description: 'Shop rent, Kisenyi', amount: 600000 },
    { category: 'wages', description: 'Two tailors, fortnight', amount: 700000 },
    { category: 'transport', description: 'Fabric collection from town', amount: 25000 },
    { category: 'utilities', description: 'Electricity and water', amount: 95000 },
    { category: 'materials', description: 'Lining and interfacing', amount: 180000 },
    { category: 'other', description: 'Machine needles and oil', amount: 40000 },
  ],
}

export async function seedGenericTailorData(db: AppDatabase): Promise<ShopDoc> {
  const shop = await seedTenant(db, {
    name: 'Mirembe Tailoring House',
    businessType: 'tailor',
    ownerName: 'Miriam Ssemanda',
    whatsappNumber: '+256782640117',
    email: 'hello@mirembetailoring.co.ug',
    website: 'https://mirembetailoring.co.ug',
  })

  const ownerDoc = await db.staff.findOne({ selector: { shop_id: shop.id, role: 'owner' } }).exec()
  if (!ownerDoc) throw new Error('Seed owner was not created.')
  const owner = ownerDoc.toJSON()
  const tailor = await createStaff(db, shop.id, {
    name: 'Patrick Walusimbi',
    pin: '123456',
    role: 'staff',
  })

  const chest = await createMeasurementField(db, shop.id, {
    label: 'Chest',
    unit: 'cm',
    display_order: 0,
    group_label: 'Upper body',
  })
  const waist = await createMeasurementField(db, shop.id, {
    label: 'Waist',
    unit: 'cm',
    display_order: 1,
    group_label: 'Torso',
  })
  const hip = await createMeasurementField(db, shop.id, {
    label: 'Hip',
    unit: 'cm',
    display_order: 2,
    group_label: 'Lower body',
  })
  const sleeve = await createMeasurementField(db, shop.id, {
    label: 'Sleeve',
    unit: 'cm',
    display_order: 3,
    group_label: 'Arms',
  })

  const [john, anita, brian, walkIn] = await Promise.all([
    createClient(db, shop.id, {
      name: 'John Kato',
      phone: '+256 701 111 222',
      notes: 'Prefers two-button jackets.',
    }),
    createClient(db, shop.id, {
      name: 'Anita Nakato',
      phone: '+256 772 333 444',
      notes: 'Formal office wear.',
    }),
    createClient(db, shop.id, {
      name: 'Brian Turyasingura',
      phone: '+256 755 555 666',
    }),
    createClient(db, shop.id, {
      name: 'Samuel Byaruhanga',
      phone: '+256 772 604 118',
      notes: 'Walk-in. Paid cash, no measurements taken.',
    }),
  ])

  await saveMeasurements(db, john.id, {
    [chest.id]: 98,
    [waist.id]: 84,
    [hip.id]: 100,
    [sleeve.id]: 62,
  }, owner.id)
  await saveMeasurements(db, anita.id, {
    [chest.id]: 90,
    [waist.id]: 74,
    [hip.id]: 96,
    [sleeve.id]: 58,
  }, owner.id)

  const suit = await createOrder(db, shop.id, {
    client_id: john.id,
    order_type: 'tailor_made',
    item_description: 'Navy two-piece suit',
    price_total_minor: 850000,
    pickup_due_date: '2026-08-18',
  }, owner.id)
  const dress = await createOrder(db, shop.id, {
    client_id: anita.id,
    order_type: 'tailor_made',
    item_description: 'Office dress',
    price_total_minor: 320000,
    pickup_due_date: '2026-08-13',
  }, tailor.id)
  const shirt = await createOrder(db, shop.id, {
    client_id: brian.id,
    order_type: 'tailor_made',
    item_description: 'White formal shirt',
    price_total_minor: 180000,
    pickup_due_date: '2026-08-20',
  }, owner.id)
  const rental = await createOrder(db, shop.id, {
    client_id: john.id,
    order_type: 'rental',
    item_description: 'Black dinner jacket',
    price_total_minor: 150000,
    deposit_minor: 300000,
    pickup_due_date: '2026-08-22',
    return_due_date: '2026-08-24',
  }, owner.id)

  await changeOrderStage(db, suit.id, 'in_progress', tailor.id)
  await recordPayment(db, suit.id, {
    amount_minor: 425000,
    method: 'cash',
    notes: 'Half deposit.',
  }, owner.id)

  await changeOrderStage(db, dress.id, 'ready', tailor.id)
  await recordPayment(db, dress.id, {
    amount_minor: 320000,
    method: 'mobile_money',
  }, tailor.id)

  await recordPayment(db, shirt.id, {
    amount_minor: 60000,
    method: 'mobile_money',
  }, owner.id)

  await changeOrderStage(db, rental.id, 'picked_up', owner.id)
  await recordPayment(db, rental.id, {
    amount_minor: 150000,
    method: 'cash',
  }, owner.id)

  await logMessage(db, {
    client_id: anita.id,
    order_id: dress.id,
    template: 'stage_update',
    order_stage: 'ready',
  }, tailor.id)

  await recordSale(db, shop, {
    item_description: 'Pocket square',
    quantity: 3,
    unit_price_minor: 25000,
    method: 'cash',
    client_id: walkIn.id,
  }, owner.id)

  await recordExpense(db, shop, {
    category: 'rent',
    description: 'Workshop rent',
    amount_minor: 600000,
    spent_on: '2026-08-01',
  }, owner.id)
  await recordExpense(db, shop, {
    category: 'materials',
    description: 'Suiting fabric',
    amount_minor: 280000,
    spent_on: '2026-08-05',
  }, tailor.id)

  await seedVolume(db, shop, {
    catalogue: MIREMBE_CATALOGUE,
    extraClients: 14,
    orders: 21,
    sales: 20,
    expenses: 14,
    salePrefix: 'MTH',
  })

  return shop
}
