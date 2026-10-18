// Fixtures for the owner tests: drops with paid history, written straight into the *_test database.
import type { Db } from '../../server/db/client'
import { customers, drops, menuItems, orderItems, orders, turnedAway } from '../../server/db/schema'

export const DAY = 24 * 60 * 60 * 1000

export async function makeFlavour(db: Db, name: string) {
  const [item] = await db
    .insert(menuItems)
    .values({ name, tasteGroup: 'sweet', size: '330ml', pricePesewas: 3500, capacityWeight: 1 })
    .returning({ id: menuItems.id })
  return item!.id
}

export async function makeCustomer(db: Db) {
  const [row] = await db.insert(customers).values({ firstName: 'Sample', phone: '+233200000009' }).returning({ id: customers.id })
  return row!.id
}

export async function makeDropAt(
  db: Db,
  cutOffAt: Date,
  extra: { capacity?: number; status?: 'open' | 'closed' | 'completed'; unplannedSold?: number } = {}
) {
  const [drop] = await db
    .insert(drops)
    .values({
      dropAt: new Date(cutOffAt.getTime() + 3 * DAY),
      cutOffAt,
      capacity: extra.capacity ?? 70,
      status: extra.status ?? 'open',
      unplannedSold: extra.unplannedSold ?? null
    })
    .returning({ id: drops.id })
  return drop!.id
}

/** One order on a drop, inserted directly. `paidAt` is required for paid statuses. */
export async function insertOrder(
  db: Db,
  args: {
    dropId: string
    itemId: string
    quantity: number
    status: 'requested' | 'paid_confirmed' | 'fulfilled' | 'cancelled' | 'expired'
    createdAt: Date
    paidAt?: Date
    customerId?: string
  }
) {
  const [order] = await db
    .insert(orders)
    .values({
      dropId: args.dropId,
      customerId: args.customerId ?? null,
      status: args.status,
      fulfilment: 'pickup',
      totalPesewas: 3500 * args.quantity,
      createdAt: args.createdAt,
      paidAt: args.paidAt ?? null
    })
    .returning({ id: orders.id })
  await db.insert(orderItems).values({ orderId: order!.id, menuItemId: args.itemId, quantity: args.quantity, unitPricePesewas: 3500 })
  return order!.id
}

/**
 * A closed drop with fulfilled orders paid at the given days before its cut-off.
 * Example: paidDays [4, 2, 1] with 10 each puts 10 units at 4, 2 and 1 days before cut-off.
 */
export async function closedDropWithPayments(
  db: Db,
  args: { cutOffAt: Date; itemId: string; payments: { daysBefore: number; quantity: number }[]; capacity?: number; unplannedSold?: number }
) {
  const dropId = await makeDropAt(db, args.cutOffAt, { capacity: args.capacity, status: 'completed', unplannedSold: args.unplannedSold })
  for (const p of args.payments) {
    const paidAt = new Date(args.cutOffAt.getTime() - p.daysBefore * DAY)
    await insertOrder(db, { dropId, itemId: args.itemId, quantity: p.quantity, status: 'fulfilled', createdAt: paidAt, paidAt })
  }
  return dropId
}

export async function turnAway(db: Db, dropId: string, units: number, orderId: string | null) {
  await db.insert(turnedAway).values({ dropId, orderId, units, reason: 'not_enough_space' })
}
