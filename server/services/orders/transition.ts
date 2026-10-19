// One order status change, inside the caller's transaction with the order row locked:
// the new status, refund_due, a cancelled request's hold dropped, and its history row (BR-O5).
// Shared by the owner actions (O2) and the customer cancel (C9).
import { eq } from 'drizzle-orm'
import type { OrderStatus } from '../../domain/orders/requests'
import type { Tx } from '../../db/client'
import { orderHistory, orders } from '../../db/schema'

export async function writeTransition(
  tx: Tx,
  order: { id: string; status: OrderStatus; refundDue: boolean; holdExpiresAt: Date | null },
  decision: { to: OrderStatus; refundDue: boolean },
  ctx: { actor: 'owner' | 'customer'; now: Date; demoMode: boolean }
): Promise<{ status: OrderStatus; refundDue: boolean }> {
  const refundDue = order.refundDue || decision.refundDue
  await tx
    .update(orders)
    .set({
      status: decision.to,
      refundDue,
      // A cancelled request's hold, if any, stops counting straight away.
      holdExpiresAt: decision.to === 'cancelled' ? null : order.holdExpiresAt
    })
    .where(eq(orders.id, order.id))
  await tx.insert(orderHistory).values({
    orderId: order.id,
    fromStatus: order.status,
    toStatus: decision.to,
    actor: ctx.actor,
    createdAt: ctx.now,
    isSample: ctx.demoMode
  })
  return { status: decision.to, refundDue }
}
