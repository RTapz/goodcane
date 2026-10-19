// What a customer may cancel on C9 (BR-X3, BR-O4). Pure.
import { describe, expect, it } from 'vitest'
import { decideCustomerCancel } from '../../../server/domain/orders/customer-cancel'

const cutOffAt = new Date('2026-10-21T14:00:00Z')
const before = new Date('2026-10-20T09:00:00Z')

describe('decideCustomerCancel', () => {
  it('before cut-off: a request is cancelled with no refund; a paid order with a refund due', () => {
    expect(decideCustomerCancel({ status: 'requested', lapsed: false, cutOffAt, now: before })).toEqual({
      ok: true,
      to: 'cancelled',
      refundDue: false
    })
    expect(decideCustomerCancel({ status: 'paid_confirmed', lapsed: false, cutOffAt, now: before })).toEqual({
      ok: true,
      to: 'cancelled',
      refundDue: true
    })
  })

  it('at or after cut-off only the owner can cancel', () => {
    expect(decideCustomerCancel({ status: 'paid_confirmed', lapsed: false, cutOffAt, now: cutOffAt })).toEqual({
      ok: false,
      reason: 'after_cut_off'
    })
  })

  it('a lapsed request is already over and is not cancelled again', () => {
    expect(decideCustomerCancel({ status: 'requested', lapsed: true, cutOffAt, now: before })).toEqual({ ok: false, reason: 'not_allowed' })
  })

  it('fulfilled, cancelled and expired orders are final', () => {
    for (const status of ['fulfilled', 'cancelled', 'expired'] as const) {
      expect(decideCustomerCancel({ status, lapsed: false, cutOffAt, now: before })).toEqual({ ok: false, reason: 'not_allowed' })
    }
  })
})
