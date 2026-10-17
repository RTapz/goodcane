// Rules for requested (unpaid) orders. Pure: callers pass in the time.
import { fitsInDrop } from '../capacity/spaces'

const MS_PER_DAY = 24 * 60 * 60 * 1000

export type OrderStatus = 'requested' | 'paid_confirmed' | 'fulfilled' | 'cancelled' | 'expired'

export interface DropForOrdering {
  status: 'open' | 'closed' | 'completed'
  cutOffAt: Date
}

export type OrderDecision =
  | { ok: true }
  | { ok: false; reason: 'drop_closed' }
  | { ok: false; reason: 'not_enough_space'; spacesLeft: number }

/**
 * Can this order be placed now? Orders are accepted only while now is before the cut-off
 * and the drop is open (BR-D3). The space check is advisory: it reserves nothing (BR-O9).
 */
export function checkOrderAllowed(args: {
  drop: DropForOrdering
  now: Date
  units: number
  spacesLeft: number
}): OrderDecision {
  const { drop, now, units, spacesLeft } = args
  if (drop.status !== 'open' || now.getTime() >= drop.cutOffAt.getTime()) {
    return { ok: false, reason: 'drop_closed' }
  }
  if (!fitsInDrop(units, spacesLeft)) {
    return { ok: false, reason: 'not_enough_space', spacesLeft }
  }
  return { ok: true }
}

export interface RequestLike {
  status: OrderStatus
  createdAt: Date
}

/**
 * A requested order lapses when unpaid after the earlier of `expiryDays` from creation
 * or the drop's cut-off (lifecycle table, `expired`). Applied on read until a job writes it.
 */
export function isRequestLapsed(order: RequestLike, cutOffAt: Date, now: Date, expiryDays: number): boolean {
  if (order.status !== 'requested') return false
  const limit = Math.min(order.createdAt.getTime() + expiryDays * MS_PER_DAY, cutOffAt.getTime())
  return now.getTime() >= limit
}

export interface RetireCandidate {
  id: string
  customerId: string | null
  dropId: string
  status: OrderStatus
  holdExpiresAt: Date | null
}

/**
 * BR-O8: a new order from a session on a drop retires that session's older requested orders
 * on the same drop, unless they have an active hold. Paid orders are never touched.
 */
export function ordersToRetire(
  orders: RetireCandidate[],
  scope: { customerId: string; dropId: string; now: Date }
): string[] {
  return orders
    .filter(
      (o) =>
        o.customerId === scope.customerId &&
        o.dropId === scope.dropId &&
        o.status === 'requested' &&
        !(o.holdExpiresAt && o.holdExpiresAt.getTime() > scope.now.getTime())
    )
    .map((o) => o.id)
}
