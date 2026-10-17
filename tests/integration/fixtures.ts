// Shared fixtures for integration tests on the *_test database.
import { randomUUID } from 'node:crypto'
import type { Db } from '../../server/db/client'
import { drops, menuItems } from '../../server/db/schema'
import { placeOrder } from '../../server/services/orders/place-order'

export const HOUR = 60 * 60 * 1000
export const MIN = 60 * 1000

export async function makeDrop(db: Db, capacity: number, cutOffAt: Date) {
  const [drop] = await db
    .insert(drops)
    .values({ dropAt: new Date(cutOffAt.getTime() + 72 * HOUR), cutOffAt, capacity, status: 'open' })
    .returning({ id: drops.id })
  return drop!.id
}

export async function makeItem(db: Db) {
  const [item] = await db
    .insert(menuItems)
    .values({ name: 'Raw cane', tasteGroup: 'sweet', size: '330ml', pricePesewas: 3500, capacityWeight: 1 })
    .returning({ id: menuItems.id })
  return item!.id
}

/** A requested order of `quantity` bottles from a brand-new customer (no session). */
export async function requestedOrder(db: Db, dropId: string, itemId: string, quantity: number, now: Date) {
  const result = await placeOrder(
    db,
    {
      dropId,
      lines: [{ menuItemId: itemId, quantity }],
      firstName: 'Sample',
      phone: '+233200000001',
      fulfilment: { kind: 'pickup' },
      idempotencyKey: randomUUID()
    },
    { now, sessionCustomerId: null, demoMode: true }
  )
  if (result.kind !== 'created') throw new Error(`fixture order not created: ${result.kind}`)
  return { orderId: result.orderId, customerId: result.customerId }
}
