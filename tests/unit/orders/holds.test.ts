import { describe, expect, it } from 'vitest'
import {
  decidePaymentSuccess,
  decidePayStart,
  isHoldActive,
  type PaymentCheck
} from '../../../server/domain/orders/holds'

const MIN = 60 * 1000
const now = new Date('2026-10-17T12:00:00Z')
const beforeCutOff = { status: 'open' as const, cutOffAt: new Date(now.getTime() + 60 * MIN) }
const afterCutOff = { status: 'open' as const, cutOffAt: new Date(now.getTime() - MIN) }

function check(overrides: Partial<PaymentCheck> = {}): PaymentCheck {
  return {
    order: { status: 'requested', holdExpiresAt: null },
    drop: beforeCutOff,
    now,
    spacesLeft: 10,
    units: 3,
    requestLapsed: false,
    ...overrides
  }
}
const activeHold = new Date(now.getTime() + 5 * MIN)
const expiredHold = new Date(now.getTime() - MIN)

describe('isHoldActive', () => {
  it('is active only strictly before the expiry', () => {
    expect(isHoldActive(new Date(now.getTime() + 1), now)).toBe(true)
    expect(isHoldActive(now, now)).toBe(false)
    expect(isHoldActive(null, now)).toBe(false)
  })
})

describe('decidePayStart (BR-O1, BR-D3, BR-P5)', () => {
  it('holds for hold_minutes when the order fits before the cut-off', () => {
    expect(decidePayStart({ ...check(), holdMinutes: 10 })).toEqual({
      kind: 'hold',
      holdExpiresAt: new Date(now.getTime() + 10 * MIN)
    })
  })

  it('fits exactly at the edge', () => {
    expect(decidePayStart({ ...check({ spacesLeft: 3 }), holdMinutes: 10 }).kind).toBe('hold')
  })

  it('returns an existing active hold unchanged, even after the cut-off', () => {
    const order = { status: 'requested' as const, holdExpiresAt: activeHold }
    expect(decidePayStart({ ...check({ order, drop: afterCutOff }), holdMinutes: 10 })).toEqual({
      kind: 'existing_hold',
      holdExpiresAt: activeHold
    })
  })

  it('re-holds after the old hold expired (Refresh availability) if it still fits', () => {
    const order = { status: 'requested' as const, holdExpiresAt: expiredHold }
    expect(decidePayStart({ ...check({ order }), holdMinutes: 10 }).kind).toBe('hold')
  })

  it('refuses at or after the cut-off by server time', () => {
    expect(decidePayStart({ ...check({ drop: afterCutOff }), holdMinutes: 10 })).toEqual({ kind: 'drop_closed' })
    const atCutOff = { status: 'open' as const, cutOffAt: now }
    expect(decidePayStart({ ...check({ drop: atCutOff }), holdMinutes: 10 })).toEqual({ kind: 'drop_closed' })
  })

  it('says drop_closed (not not_payable) when the request lapsed because the cut-off passed', () => {
    expect(decidePayStart({ ...check({ drop: afterCutOff, requestLapsed: true }), holdMinutes: 10 })).toEqual({
      kind: 'drop_closed'
    })
    expect(decidePaymentSuccess(check({ drop: afterCutOff, requestLapsed: true }))).toEqual({
      kind: 'not_confirmed',
      reason: 'drop_closed'
    })
  })

  it('asks the customer when the order does not fit (BR-F1)', () => {
    expect(decidePayStart({ ...check({ spacesLeft: 2 }), holdMinutes: 10 })).toEqual({
      kind: 'not_enough_space',
      spacesLeft: 2
    })
  })

  it('refuses a lapsed request and an order that is not requested', () => {
    expect(decidePayStart({ ...check({ requestLapsed: true }), holdMinutes: 10 })).toEqual({ kind: 'not_payable' })
    const paid = { status: 'paid_confirmed' as const, holdExpiresAt: null }
    expect(decidePayStart({ ...check({ order: paid }), holdMinutes: 10 })).toEqual({ kind: 'not_payable' })
  })
})

describe('decidePaymentSuccess (BR-O2)', () => {
  it('confirms with an active hold (own hold counts as available)', () => {
    const order = { status: 'requested' as const, holdExpiresAt: activeHold }
    expect(decidePaymentSuccess(check({ order, spacesLeft: 3 }))).toEqual({ kind: 'confirm' })
  })

  it('confirms after the hold expired if the order still fits', () => {
    const order = { status: 'requested' as const, holdExpiresAt: expiredHold }
    expect(decidePaymentSuccess(check({ order }))).toEqual({ kind: 'confirm' })
  })

  it('does not confirm after the hold expired if the order no longer fits', () => {
    const order = { status: 'requested' as const, holdExpiresAt: expiredHold }
    expect(decidePaymentSuccess(check({ order, spacesLeft: 1 }))).toEqual({
      kind: 'not_confirmed',
      reason: 'not_enough_space',
      spacesLeft: 1
    })
  })

  it('honours an active hold after the cut-off, but not an expired one', () => {
    const held = { status: 'requested' as const, holdExpiresAt: activeHold }
    expect(decidePaymentSuccess(check({ order: held, drop: afterCutOff }))).toEqual({ kind: 'confirm' })
    const expired = { status: 'requested' as const, holdExpiresAt: expiredHold }
    expect(decidePaymentSuccess(check({ order: expired, drop: afterCutOff }))).toEqual({
      kind: 'not_confirmed',
      reason: 'drop_closed'
    })
  })

  it('never confirms twice', () => {
    const paid = { status: 'paid_confirmed' as const, holdExpiresAt: null }
    expect(decidePaymentSuccess(check({ order: paid }))).toEqual({ kind: 'not_confirmed', reason: 'already_paid' })
  })

  it('refuses a lapsed request without an active hold, and an expired or cancelled order', () => {
    expect(decidePaymentSuccess(check({ requestLapsed: true }))).toEqual({ kind: 'not_confirmed', reason: 'not_payable' })
    const expired = { status: 'expired' as const, holdExpiresAt: null }
    expect(decidePaymentSuccess(check({ order: expired }))).toEqual({ kind: 'not_confirmed', reason: 'not_payable' })
  })
})
