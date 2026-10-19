// C9 "Cancel this order" (BR-X1, BR-X3, BR-O4): the customer's own order, before cut-off.
// Same locked transaction and history as the owner cancel. The order row is locked, so a payment
// arriving at the same moment waits: it then finds the order cancelled and is not confirmed
// (decidePaymentSuccess, BR-O2), or it confirmed first and this cancel sets refund_due.
import { and, eq } from 'drizzle-orm'
import { decideCustomerCancel } from '../../domain/orders/customer-cancel'
import { isRequestLapsed, type OrderStatus } from '../../domain/orders/requests'
import type { Db } from '../../db/client'
import { drops, orders } from '../../db/schema'
import { readSettings } from '../settings'
import { writeTransition } from './transition'

export type CustomerCancelResult =
  | { kind: 'done'; status: OrderStatus; refundDue: boolean }
  | { kind: 'not_found' }
  | { kind: 'not_allowed'; status: OrderStatus; reason: 'after_cut_off' | 'not_allowed' }

export function cancelOrderAsCustomer(
  db: Db,
  orderId: string,
  ctx: { now: Date; customerId: string; demoMode: boolean }
): Promise<CustomerCancelResult> {
  return db.transaction(async (tx) => {
    const [order] = await tx
      .select()
      .from(orders)
      .where(and(eq(orders.id, orderId), eq(orders.customerId, ctx.customerId)))
      .for('update')
    if (!order) return { kind: 'not_found' }
    const [drop] = await tx.select({ cutOffAt: drops.cutOffAt }).from(drops).where(eq(drops.id, order.dropId))
    if (!drop) return { kind: 'not_found' }

    const { request_expiry_days: expiryDays } = await readSettings(tx, ['request_expiry_days'])
    const decision = decideCustomerCancel({
      status: order.status,
      lapsed: isRequestLapsed(order, drop.cutOffAt, ctx.now, expiryDays),
      cutOffAt: drop.cutOffAt,
      now: ctx.now
    })
    if (!decision.ok) return { kind: 'not_allowed', status: order.status, reason: decision.reason }

    const done = await writeTransition(tx, order, decision, { actor: 'customer', now: ctx.now, demoMode: ctx.demoMode })
    return { kind: 'done', ...done }
  })
}
