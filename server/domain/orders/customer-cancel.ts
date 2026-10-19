// What a customer may cancel on C9 (BR-X3, BR-O4). Pure: the service loads the order and applies it.
import type { OwnerActionDecision } from './owner-actions'
import type { OrderStatus } from './requests'

export type CustomerCancelDecision = OwnerActionDecision | { ok: false; reason: 'after_cut_off' }

/**
 * Before the cut-off a customer can cancel a request (no refund) or a paid order (refund due,
 * BR-O4). After the cut-off only the owner can (BR-X3). A lapsed request is already over, and
 * fulfilled, cancelled and expired orders are final.
 */
export function decideCustomerCancel(args: { status: OrderStatus; lapsed: boolean; cutOffAt: Date; now: Date }): CustomerCancelDecision {
  const { status, lapsed, cutOffAt, now } = args
  if (now.getTime() >= cutOffAt.getTime()) return { ok: false, reason: 'after_cut_off' }
  if (status === 'requested' && !lapsed) return { ok: true, to: 'cancelled', refundDue: false }
  if (status === 'paid_confirmed') return { ok: true, to: 'cancelled', refundDue: true }
  return { ok: false, reason: 'not_allowed' }
}
