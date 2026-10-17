// Loads an order for pay-start or payment inside a transaction, with the drop row locked.
// Locking the drop row (SELECT ... FOR UPDATE) makes concurrent holds and confirmations on the
// same drop take turns, so two customers can never both take the last spaces (BR-C4).
import { and, eq, sql } from 'drizzle-orm'
import { isHoldActive } from '../../domain/orders/holds'
import { isRequestLapsed } from '../../domain/orders/requests'
import type { Tx } from '../../db/client'
import { drops, menuItems, orderItems, orders } from '../../db/schema'
import { dropUsage } from '../capacity'
import { readSettings } from '../settings'

export async function loadLockedOrder(tx: Tx, orderId: string, customerId: string, now: Date) {
  // Find the order (owned by this customer only), then lock its drop, then re-read the order.
  const [found] = await tx
    .select({ dropId: orders.dropId })
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.customerId, customerId)))
  if (!found) return null

  const [drop] = await tx.select().from(drops).where(eq(drops.id, found.dropId)).for('update')
  const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for('update')
  if (!drop || !order) return null

  const [{ units } = { units: 0 }] = await tx
    .select({ units: sql<number>`coalesce(sum(${orderItems.quantity} * ${menuItems.capacityWeight}), 0)::int` })
    .from(orderItems)
    .innerJoin(menuItems, eq(menuItems.id, orderItems.menuItemId))
    .where(eq(orderItems.orderId, orderId))

  const usage = (await dropUsage(tx, [drop.id], now)).get(drop.id) ?? { confirmedUnits: 0, heldUnits: 0 }
  const ownHeldUnits = order.status === 'requested' && isHoldActive(order.holdExpiresAt, now) ? units : 0
  // Spaces NOT counting this order's own hold: its own hold is available to it (BR-O2).
  const spacesLeft = Math.max(0, drop.capacity - usage.confirmedUnits - (usage.heldUnits - ownHeldUnits))

  const settings = await readSettings(tx, ['hold_minutes', 'request_expiry_days'])
  const requestLapsed = isRequestLapsed(order, drop.cutOffAt, now, settings.request_expiry_days)

  return { order, drop, units, spacesLeft, requestLapsed, holdMinutes: settings.hold_minutes }
}
