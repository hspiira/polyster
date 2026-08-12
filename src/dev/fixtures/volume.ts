import type { AppDatabase } from '../../db/database'
import type { ExpenseCategory, OrderType, PaymentMethod, ShopDoc } from '../../db/schema'
import { stagesFor } from '../../screens/orderStage'
import { addDays, today } from '../../lib/dates'
import {
  changeOrderStage,
  createClient,
  createOrder,
  recordExpense,
  recordPayment,
  recordSale,
} from './_fixture_helpers'

export interface VolumeCatalogue {
  garments: readonly { item: string; price: number; type: OrderType }[]
  retail: readonly { item: string; price: number }[]
  expenses: readonly { category: ExpenseCategory; description: string; amount: number }[]
}

export interface VolumeInput {
  catalogue: VolumeCatalogue
  extraClients: number
  orders: number
  sales: number
  expenses: number
  salePrefix: string
}

const NAMES = [
  'Aisha Nakalema', 'Brian Ssekandi', 'Catherine Nabirye', 'David Wasswa',
  'Fred Muwanga', 'Gloria Nansubuga', 'Henry Lubega', 'Ivan Kyeyune',
  'Joan Ssebbowa', 'Kevin Ochieng', 'Lydia Namaganda', 'Martin Otim',
  'Nancy Akello', 'Oscar Tumusiime', 'Patience Aber', 'Robert Mukasa',
  'Sylvia Nakayima', 'Tony Bwambale', 'Winnie Adong', 'Zahara Mbabazi',
  'Emmanuel Kiwanuka', 'Faith Nakimuli', 'Gerald Ssempijja', 'Harriet Atim',
] as const

const PREFIXES = ['0772', '0782', '0701', '0752', '0774', '0703', '0758', '0776'] as const

const CLIENT_NOTES = [
  'Prefers a slim fit through the waist.',
  'Collects on Saturdays.',
  'Pays by mobile money.',
  'Wants the same tailor each time.',
  'Repeat customer since 2024.',
  undefined,
] as const

const METHODS: readonly PaymentMethod[] = ['mobile_money', 'cash', 'mobile_money', 'bank']

/** Coprime with the pool lengths used below, so values vary instead of cycling in step. */
function pick<T>(pool: readonly T[], index: number, stride: number): T {
  return pool[(index * stride) % pool.length]!
}

function phoneFor(index: number): string {
  const prefix = pick(PREFIXES, index, 3)
  const tail = String(100000 + ((index * 74209) % 900000))
  return `+256 ${prefix.slice(1)} ${tail.slice(0, 3)} ${tail.slice(3)}`
}

function stageFor(type: OrderType, dueOffset: number, index: number): ReturnType<typeof stagesFor>[number] {
  const flow = stagesFor(type)
  const position =
    dueOffset < -14 ? flow.length - 1
    : dueOffset < -3 ? (index % 4 === 0 ? flow.length - 2 : flow.length - 1)
    : dueOffset <= 3 ? Math.min(2, flow.length - 1)
    : index % 5 === 0 ? 1
    : 0
  return flow[Math.max(0, Math.min(position, flow.length - 1))]!
}

export async function seedVolume(
  db: AppDatabase,
  shop: Pick<ShopDoc, 'id' | 'currency'>,
  input: VolumeInput,
): Promise<void> {
  const staff = await db.staff.find({ selector: { shop_id: shop.id, active: true } }).exec()
  const staffIds = staff.map((doc) => doc.id)
  const owner = staff.find((doc) => doc.role === 'owner')?.id ?? staffIds[0]!

  for (let i = 0; i < input.extraClients; i += 1) {
    await createClient(db, shop.id, {
      name: pick(NAMES, i, 1),
      phone: phoneFor(i),
      ...(pick(CLIENT_NOTES, i, 5) ? { notes: pick(CLIENT_NOTES, i, 5)! } : {}),
    })
  }

  const clientDocs = await db.clients.find({ selector: { shop_id: shop.id } }).exec()
  const clientIds = clientDocs.map((doc) => doc.id)
  if (clientIds.length === 0) return

  const start = today()

  for (let i = 0; i < input.orders; i += 1) {
    const garment = pick(input.catalogue.garments, i, 5)
    const dueOffset = -35 + ((i * 11) % 60)
    const due = addDays(start, dueOffset)
    const staffId = pick(staffIds, i, 1)

    const order = await createOrder(
      db,
      shop.id,
      {
        client_id: pick(clientIds, i, 3),
        order_type: garment.type,
        item_description: garment.item,
        price_total_minor: garment.price,
        pickup_due_date: due,
        ...(garment.type === 'rental'
          ? { return_due_date: addDays(due, 3), deposit_minor: Math.round(garment.price / 2) }
          : {}),
      },
      staffId,
    )

    const stage = stageFor(garment.type, dueOffset, i)
    if (stage !== 'measured') await changeOrderStage(db, order.id, stage, staffId)

    if (i % 7 !== 0) {
      const deposit = Math.round(garment.price * (i % 3 === 0 ? 0.5 : 0.3))
      await recordPayment(db, order.id, { amount_minor: deposit, method: pick(METHODS, i, 1) }, staffId)

      if (stage === 'picked_up' || stage === 'returned') {
        await recordPayment(
          db,
          order.id,
          { amount_minor: garment.price - deposit, method: pick(METHODS, i, 3) },
          staffId,
        )
      }
    }
  }

  for (let i = 0; i < input.sales; i += 1) {
    const line = pick(input.catalogue.retail, i, 3)
    const quantity = 1 + (i % 3)
    const sale = await recordSale(
      db,
      shop,
      {
        item_description: line.item,
        quantity,
        unit_price_minor: line.price,
        method: pick(METHODS, i, 1),
        reference: `SALE-${input.salePrefix}-${String(i + 1).padStart(3, '0')}`,
        ...(i % 3 === 0 ? { client_id: pick(clientIds, i, 5) } : {}),
      },
      pick(staffIds, i, 1),
    )

    const soldAt = `${addDays(start, -((i * 3) % 45))}T${String(9 + (i % 8)).padStart(2, '0')}:20:00.000Z`
    // recordSale stamps now(); Reports read by date range.
    await (await db.sales.findOne(sale.id).exec())?.patch({ sold_at: soldAt })
  }

  for (let i = 0; i < input.expenses; i += 1) {
    const line = pick(input.catalogue.expenses, i, 1)
    await recordExpense(
      db,
      shop,
      {
        category: line.category,
        description: line.description,
        amount_minor: line.amount,
        spent_on: addDays(start, -((i * 5) % 50)),
      },
      owner,
    )
  }
}
