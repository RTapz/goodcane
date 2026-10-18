import { describe, expect, it } from 'vitest'
import { decideFulfil, decideOwnerCancel } from '../../../server/domain/orders/owner-actions'

describe('decideFulfil (BR-O3)', () => {
  it('only from paid_confirmed', () => {
    expect(decideFulfil('paid_confirmed')).toEqual({ ok: true, to: 'fulfilled', refundDue: false })
    for (const status of ['requested', 'fulfilled', 'cancelled', 'expired'] as const) {
      expect(decideFulfil(status)).toEqual({ ok: false, reason: 'not_allowed' })
    }
  })
})

describe('decideOwnerCancel (BR-O4)', () => {
  it('a paid order is cancelled with a refund due', () => {
    expect(decideOwnerCancel('paid_confirmed')).toEqual({ ok: true, to: 'cancelled', refundDue: true })
  })
  it('a request is cancelled with no refund', () => {
    expect(decideOwnerCancel('requested')).toEqual({ ok: true, to: 'cancelled', refundDue: false })
  })
  it('final states cannot be cancelled', () => {
    for (const status of ['fulfilled', 'cancelled', 'expired'] as const) {
      expect(decideOwnerCancel(status)).toEqual({ ok: false, reason: 'not_allowed' })
    }
  })
})
