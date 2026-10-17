// pay-start (BR-O1, BR-C4): one transaction, drop row locked, then hold or refuse.
// Also used for "Refresh availability" after a hold expires (BR-P5).
import { eq } from 'drizzle-orm'
import { decidePayStart } from '../../domain/orders/holds'
import type { Db } from '../../db/client'
import { orders, turnedAway } from '../../db/schema'
import { loadLockedOrder } from './locked-order'

export type PayStartResult =
  | { kind: 'held'; holdExpiresAt: Date; existing: boolean }
  | { kind: 'rejected'; reason: 'drop_closed' | 'not_payable' }
  | { kind: 'rejected'; reason: 'not_enough_space'; spacesLeft: number }
  | { kind: 'not_found' }

export async function payStart(
  db: Db,
  orderId: string,
  ctx: { now: Date; customerId: string; demoMode: boolean }
): Promise<PayStartResult> {
  const { now, customerId, demoMode } = ctx
  return db.transaction(async (tx) => {
    const loaded = await loadLockedOrder(tx, orderId, customerId, now)
    if (!loaded) return { kind: 'not_found' }

    const decision = decidePayStart({ ...loaded, now })
    switch (decision.kind) {
      case 'existing_hold':
        return { kind: 'held', holdExpiresAt: decision.holdExpiresAt, existing: true }
      case 'hold':
        await tx.update(orders).set({ holdExpiresAt: decision.holdExpiresAt }).where(eq(orders.id, orderId))
        return { kind: 'held', holdExpiresAt: decision.holdExpiresAt, existing: false }
      case 'not_enough_space':
        // BR-F2: the customer could not be served in the drop they wanted. Once per order.
        await tx
          .insert(turnedAway)
          .values({
            dropId: loaded.drop.id,
            orderId,
            units: loaded.units,
            reason: 'not_enough_space',
            createdAt: now,
            isSample: demoMode
          })
          .onConflictDoNothing({ target: turnedAway.orderId })
        return { kind: 'rejected', reason: 'not_enough_space', spacesLeft: decision.spacesLeft }
      default:
        return { kind: 'rejected', reason: decision.kind }
    }
  })
}
