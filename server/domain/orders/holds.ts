// Holds and payment confirmation. Pure: callers pass in the time and the spaces left.
import { fitsInDrop } from '../capacity/spaces'
import type { DropForOrdering, OrderStatus } from './requests'

const MS_PER_MINUTE = 60 * 1000

export function isHoldActive(holdExpiresAt: Date | null, now: Date): boolean {
  return holdExpiresAt !== null && holdExpiresAt.getTime() > now.getTime()
}

export interface PayableOrder {
  status: OrderStatus
  holdExpiresAt: Date | null
}

export interface PaymentCheck {
  order: PayableOrder
  drop: DropForOrdering
  now: Date
  /** Spaces left NOT counting this order's own hold (capacity minus paid units minus other holds). */
  spacesLeft: number
  /** Weighted units in this order. */
  units: number
  /** Unpaid past the request limit (isRequestLapsed). */
  requestLapsed: boolean
}

export type PayStartDecision =
  | { kind: 'existing_hold'; holdExpiresAt: Date }
  | { kind: 'hold'; holdExpiresAt: Date }
  | { kind: 'drop_closed' }
  | { kind: 'not_enough_space'; spacesLeft: number }
  | { kind: 'not_payable' }

/**
 * pay-start (BR-O1): an active hold is returned unchanged; otherwise hold for `holdMinutes`
 * if the order fits before the cut-off (BR-D3), else ask the customer (BR-F1).
 */
export function decidePayStart(check: PaymentCheck & { holdMinutes: number }): PayStartDecision {
  const { order, drop, now, spacesLeft, units, requestLapsed, holdMinutes } = check
  if (order.status !== 'requested') return { kind: 'not_payable' }
  if (order.holdExpiresAt && isHoldActive(order.holdExpiresAt, now)) {
    return { kind: 'existing_hold', holdExpiresAt: order.holdExpiresAt }
  }
  // Closed first: past the cut-off a request is also lapsed, and "closed" tells the customer more.
  if (drop.status !== 'open' || now.getTime() >= drop.cutOffAt.getTime()) return { kind: 'drop_closed' }
  if (requestLapsed) return { kind: 'not_payable' }
  if (!fitsInDrop(units, spacesLeft)) return { kind: 'not_enough_space', spacesLeft }
  return { kind: 'hold', holdExpiresAt: new Date(now.getTime() + holdMinutes * MS_PER_MINUTE) }
}

export type PaymentSuccessDecision =
  | { kind: 'confirm' }
  | { kind: 'not_confirmed'; reason: 'not_enough_space'; spacesLeft: number }
  | { kind: 'not_confirmed'; reason: 'drop_closed' | 'not_payable' | 'already_paid' }

/**
 * A simulated provider says "success" (BR-O2): re-check availability, with this order's own
 * hold counting as available to it. An active hold taken before the cut-off is honoured after it;
 * without an active hold, a success at or after the cut-off is drop_closed.
 */
export function decidePaymentSuccess(check: PaymentCheck): PaymentSuccessDecision {
  const { order, drop, now, spacesLeft, units, requestLapsed } = check
  if (order.status === 'paid_confirmed' || order.status === 'fulfilled') {
    return { kind: 'not_confirmed', reason: 'already_paid' }
  }
  if (order.status !== 'requested') return { kind: 'not_confirmed', reason: 'not_payable' }

  const holdActive = isHoldActive(order.holdExpiresAt, now)
  if (!holdActive) {
    if (drop.status !== 'open' || now.getTime() >= drop.cutOffAt.getTime()) {
      return { kind: 'not_confirmed', reason: 'drop_closed' }
    }
    if (requestLapsed) return { kind: 'not_confirmed', reason: 'not_payable' }
  }
  if (!fitsInDrop(units, spacesLeft)) {
    return { kind: 'not_confirmed', reason: 'not_enough_space', spacesLeft }
  }
  return { kind: 'confirm' }
}
