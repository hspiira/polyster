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
  setFeatureEnabled,
  type ShopDoc,
} from './_fixture_helpers'

/**
 * Full NORTH//FOUND local/offline fixture.
 *
 * Only data belonging to the current RxDB/offline model is created here.
 * Online-only domains (catalogue, suppliers, inventory, production,
 * collections, garment identity/passport) are seeded by supabase/seed.sql.
 *
 * Default test PIN for all seeded staff: 123456
 */
export async function seedNorthFoundData(db: AppDatabase): Promise<ShopDoc> {
  const shop = await seedTenant(db, {
    name: 'NORTH//FOUND',
    businessType: 'apparel_brand',
    ownerName: 'Henry Piira',
    whatsappNumber: '+256700000001',
    email: 'hello@northfound.ug',
    website: 'https://northfound.ug',
    featureOverrides: {
      catalogue: true,
      inventory: true,
      suppliers: true,
      production: true,
      pre_orders: true,
      corporate_orders: true,
      collections: true,
      garment_identity: true,
      garment_passport: true,
      rentals: true,
      repairs: true,
      sales: true,
      expenses: true,
    },
  })

  const ownerDoc = await db.staff.findOne({ selector: { shop_id: shop.id, role: 'owner' } }).exec()
  if (!ownerDoc) throw new Error('Seed owner was not created.')
  const owner = ownerDoc.toJSON()
  const manager = await createStaff(db, shop.id, {
    name: 'Nadia Kato',
    pin: '123456',
    role: 'manager',
  })
  const maker = await createStaff(db, shop.id, {
    name: 'Joel Mugisha',
    pin: '123456',
    role: 'staff',
  })

  const fields = await Promise.all([
    createMeasurementField(db, shop.id, {
      label: 'Chest',
      unit: 'cm',
      display_order: 0,
      group_label: 'Upper body',
    }),
    createMeasurementField(db, shop.id, {
      label: 'Waist',
      unit: 'cm',
      display_order: 1,
      group_label: 'Torso',
    }),
    createMeasurementField(db, shop.id, {
      label: 'Hip',
      unit: 'cm',
      display_order: 2,
      group_label: 'Lower body',
    }),
    createMeasurementField(db, shop.id, {
      label: 'Shoulder',
      unit: 'cm',
      display_order: 3,
      group_label: 'Upper body',
    }),
    createMeasurementField(db, shop.id, {
      label: 'Sleeve',
      unit: 'cm',
      display_order: 4,
      group_label: 'Arms',
    }),
    createMeasurementField(db, shop.id, {
      label: 'Inseam',
      unit: 'cm',
      display_order: 5,
      group_label: 'Lower body',
    }),
    createMeasurementField(db, shop.id, {
      label: 'Fit preference',
      field_type: 'text',
      display_order: 6,
      group_label: 'Preferences',
    }),
  ])

  const [maya, daniel, sarah, nathan, grace] = await Promise.all([
    createClient(db, shop.id, {
      name: 'Maya Namusoke',
      phone: '+256 701 240 118',
      notes: 'Prefers clean, slightly relaxed silhouettes.',
    }),
    createClient(db, shop.id, {
      name: 'Daniel Ouma',
      phone: '+256 772 410 229',
      notes: 'Corporate client. Usually needs delivery before Friday.',
    }),
    createClient(db, shop.id, {
      name: 'Sarah Atwine',
      phone: '+256 755 381 440',
      notes: 'Prefers neutral colours.',
    }),
    createClient(db, shop.id, {
      name: 'Nathan Kato',
      phone: '+256 783 912 016',
      notes: 'Frequent customer; keep previous measurements.',
    }),
    createClient(db, shop.id, {
      name: 'Grace Achieng',
      phone: '+256 704 665 391',
      notes: 'Pre-order customer for FOUND 02.',
    }),
    createClient(db, shop.id, {
      name: 'Kintu & Co.',
      phone: '+256 759 820 410',
      notes: 'Corporate account used for sample corporate orders.',
    }),
  ])

  await Promise.all([
    saveMeasurements(db, maya.id, {
      [fields[0].id]: 88,
      [fields[1].id]: 72,
      [fields[2].id]: 94,
      [fields[3].id]: 40,
      [fields[4].id]: 61,
      [fields[5].id]: 79,
      [fields[6].id]: 'relaxed',
    }, owner.id),
    saveMeasurements(db, daniel.id, {
      [fields[0].id]: 104,
      [fields[1].id]: 92,
      [fields[2].id]: 106,
      [fields[3].id]: 46,
      [fields[4].id]: 64,
      [fields[5].id]: 82,
      [fields[6].id]: 'regular',
    }, manager.id),
    saveMeasurements(db, sarah.id, {
      [fields[0].id]: 92,
      [fields[1].id]: 76,
      [fields[2].id]: 98,
      [fields[3].id]: 41,
      [fields[4].id]: 59,
      [fields[5].id]: 76,
      [fields[6].id]: 'slim',
    }, owner.id),
    saveMeasurements(db, nathan.id, {
      [fields[0].id]: 100,
      [fields[1].id]: 86,
      [fields[2].id]: 101,
      [fields[3].id]: 44,
      [fields[4].id]: 63,
      [fields[5].id]: 81,
      [fields[6].id]: 'regular',
    }, maker.id),
  ])

  const order1 = await createOrder(db, shop.id, {
    client_id: maya.id,
    order_type: 'tailor_made',
    item_description: 'FOUND 02 Overshirt, Black',
    price_total_minor: 285000,
    pickup_due_date: '2026-08-15',
    notes: 'Use the saved relaxed fit.',
  }, owner.id)
  const order2 = await createOrder(db, shop.id, {
    client_id: daniel.id,
    order_type: 'tailor_made',
    item_description: 'Corporate Linen Shirt x3',
    price_total_minor: 540000,
    pickup_due_date: '2026-08-14',
    customer_type: 'corporate',
    organisation_name: 'Kintu & Co.',
    purchase_order_reference: 'KCO-2026-081',
    contact_person: 'Daniel Ouma',
  }, manager.id)
  const order3 = await createOrder(db, shop.id, {
    client_id: sarah.id,
    order_type: 'pre_order',
    item_description: 'FOUND 02 Tee — Black / M',
    price_total_minor: 180000,
    pickup_due_date: '2026-08-29',
    expected_fulfilment_date: '2026-08-29',
    notes: 'FOUND 02 pre-order.',
  }, owner.id)
  const order4 = await createOrder(db, shop.id, {
    client_id: nathan.id,
    order_type: 'rental',
    item_description: 'Black formal blazer',
    price_total_minor: 120000,
    deposit_minor: 250000,
    pickup_due_date: '2026-08-13',
    return_due_date: '2026-08-15',
  }, maker.id)
  const order5 = await createOrder(db, shop.id, {
    client_id: grace.id,
    order_type: 'repair',
    item_description: 'Replace blazer sleeve lining',
    price_total_minor: 65000,
    pickup_due_date: '2026-08-16',
    notes: 'Customer supplied garment.',
  }, owner.id)
  const order6 = await createOrder(db, shop.id, {
    client_id: sarah.id,
    order_type: 'purchase',
    item_description: 'FOUND 01 cap',
    price_total_minor: 85000,
    pickup_due_date: '2026-08-12',
  }, maker.id)

  await changeOrderStage(db, order1.id, 'in_progress', maker.id)
  await changeOrderStage(db, order1.id, 'ready', maker.id)
  await recordPayment(db, order1.id, {
    amount_minor: 100000,
    method: 'mobile_money',
    notes: '50% deposit.',
  }, owner.id)
  await recordPayment(db, order1.id, {
    amount_minor: 185000,
    method: 'cash',
    notes: 'Balance paid.',
  }, owner.id)

  await changeOrderStage(db, order2.id, 'in_progress', manager.id)
  await recordPayment(db, order2.id, {
    amount_minor: 270000,
    method: 'bank',
    notes: 'Corporate deposit.',
  }, manager.id)

  await recordPayment(db, order3.id, {
    amount_minor: 90000,
    method: 'mobile_money',
    notes: 'Pre-order deposit.',
  }, owner.id)

  await changeOrderStage(db, order4.id, 'picked_up', maker.id)
  await recordPayment(db, order4.id, {
    amount_minor: 120000,
    method: 'mobile_money',
  }, maker.id)

  await changeOrderStage(db, order5.id, 'assessing', owner.id)
  await changeOrderStage(db, order5.id, 'approved', owner.id)
  await changeOrderStage(db, order5.id, 'repairing', maker.id)

  await changeOrderStage(db, order6.id, 'picked_up', maker.id)
  await recordPayment(db, order6.id, {
    amount_minor: 85000,
    method: 'cash',
  }, maker.id)

  await logMessage(db, {
    client_id: maya.id,
    order_id: order1.id,
    template: 'stage_update',
    order_stage: 'ready',
  }, owner.id)
  await logMessage(db, {
    client_id: daniel.id,
    order_id: order2.id,
    template: 'balance_reminder',
    order_stage: 'in_progress',
  }, manager.id)

  await recordSale(db, shop, {
    item_description: 'FOUND 01 Cap',
    quantity: 2,
    unit_price_minor: 85000,
    method: 'mobile_money',
    client_id: sarah.id,
    reference: 'SALE-NF-001',
  }, maker.id)
  await recordSale(db, shop, {
    item_description: 'Sample tote bag',
    quantity: 1,
    unit_price_minor: 0,
    method: 'cash',
    notes: 'Promotional giveaway.',
  }, owner.id)

  await recordExpense(db, shop, {
    category: 'materials',
    description: 'Black cotton fabric',
    amount_minor: 420000,
    spent_on: '2026-08-08',
    notes: 'FOUND 02 production material.',
  }, manager.id)
  await recordExpense(db, shop, {
    category: 'transport',
    description: 'Fabric delivery',
    amount_minor: 45000,
    spent_on: '2026-08-09',
  }, maker.id)
  await recordExpense(db, shop, {
    category: 'utilities',
    description: 'Workshop electricity',
    amount_minor: 110000,
    spent_on: '2026-08-10',
  }, owner.id)

  // Explicit feature overrides make this fixture useful when testing
  // navigation and feature-gated workflows.
  await setFeatureEnabled(db, shop.id, 'production', true)
  await setFeatureEnabled(db, shop.id, 'catalogue', true)
  await setFeatureEnabled(db, shop.id, 'inventory', true)
  await setFeatureEnabled(db, shop.id, 'collections', true)
  await setFeatureEnabled(db, shop.id, 'garment_identity', true)
  await setFeatureEnabled(db, shop.id, 'garment_passport', true)

  return shop
}
