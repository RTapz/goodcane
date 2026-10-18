// What the owner may do to an order on O2. Pure: the service loads the order and applies the result.
import type { OrderStatus } from './requests'

export type OwnerActionDecision =
  | { ok: true; to: OrderStatus; refundDue: boolean }
  | { ok: false; reason: 'not_allowed' }

/** BR-O3: fulfilled is set only by the owner, and only from paid_confirmed. */
export function decideFulfil(status: OrderStatus): OwnerActionDecision {
  if (status !== 'paid_confirmed') return { ok: false, reason: 'not_allowed' }
  return { ok: true, to: 'fulfilled', refundDue: false }
}

/**
 * The owner can cancel a request or a paid order, at any time (BR-X3).
 * Cancelling a paid order frees its units (status no longer counts in capacity) and marks
 * a refund as due (BR-O4). Fulfilled, cancelled and expired orders are final.
 */
export function decideOwnerCancel(status: OrderStatus): OwnerActionDecision {
  if (status === 'requested') return { ok: true, to: 'cancelled', refundDue: false }
  if (status === 'paid_confirmed') return { ok: true, to: 'cancelled', refundDue: true }
  return { ok: false, reason: 'not_allowed' }
}
