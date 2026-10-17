import { describe, expect, it } from 'vitest'
import {
  checkOrderAllowed,
  isRequestLapsed,
  ordersToRetire,
  type RetireCandidate
} from '../../../server/domain/orders/requests'

const DAY = 24 * 60 * 60 * 1000
const now = new Date('2026-10-16T12:00:00Z')
const openDrop = { status: 'open' as const, cutOffAt: new Date(now.getTime() + 3 * DAY) }

describe('checkOrderAllowed (BR-D3, BR-O9)', () => {
  it('allows an order that fits before the cut-off, exactly at the edge', () => {
    expect(checkOrderAllowed({ drop: openDrop, now, units: 5, spacesLeft: 5 })).toEqual({ ok: true })
  })

  it('rejects at or after the cut-off by server time', () => {
    const drop = { status: 'open' as const, cutOffAt: now }
    expect(checkOrderAllowed({ drop, now, units: 1, spacesLeft: 10 })).toEqual({ ok: false, reason: 'drop_closed' })
  })

  it('rejects a drop that is not open', () => {
    const drop = { ...openDrop, status: 'closed' as const }
    expect(checkOrderAllowed({ drop, now, units: 1, spacesLeft: 10 })).toEqual({ ok: false, reason: 'drop_closed' })
  })

  it('rejects an order that does not fit, with the spaces left', () => {
    expect(checkOrderAllowed({ drop: openDrop, now, units: 6, spacesLeft: 5 })).toEqual({
      ok: false,
      reason: 'not_enough_space',
      spacesLeft: 5
    })
  })
})

describe('isRequestLapsed (lifecycle: expired)', () => {
  const createdAt = new Date(now.getTime() - DAY)

  it('lapses 2 days after creation when the cut-off is later', () => {
    const cutOff = new Date(now.getTime() + 5 * DAY)
    const order = { status: 'requested' as const, createdAt }
    expect(isRequestLapsed(order, cutOff, now, 2)).toBe(false)
    expect(isRequestLapsed(order, cutOff, new Date(createdAt.getTime() + 2 * DAY), 2)).toBe(true)
  })

  it('lapses at the cut-off when that comes first', () => {
    const cutOff = new Date(now.getTime() + 60 * 60 * 1000)
    const order = { status: 'requested' as const, createdAt }
    expect(isRequestLapsed(order, cutOff, now, 2)).toBe(false)
    expect(isRequestLapsed(order, cutOff, cutOff, 2)).toBe(true)
  })

  it('never lapses a paid order', () => {
    const order = { status: 'paid_confirmed' as const, createdAt: new Date(now.getTime() - 10 * DAY) }
    expect(isRequestLapsed(order, new Date(now.getTime() - DAY), now, 2)).toBe(false)
  })
})

describe('ordersToRetire (BR-O8)', () => {
  const scope = { customerId: 'me', dropId: 'drop-1', now }
  const order = (overrides: Partial<RetireCandidate>): RetireCandidate => ({
    id: 'o',
    customerId: 'me',
    dropId: 'drop-1',
    status: 'requested',
    holdExpiresAt: null,
    ...overrides
  })

  it("retires the same session's requested order on the same drop", () => {
    expect(ordersToRetire([order({ id: 'old' })], scope)).toEqual(['old'])
  })

  it("ignores other sessions' orders", () => {
    expect(ordersToRetire([order({ customerId: 'someone-else' })], scope)).toEqual([])
  })

  it('ignores orders on other drops', () => {
    expect(ordersToRetire([order({ dropId: 'drop-2' })], scope)).toEqual([])
  })

  it('ignores an order with an active hold, but retires one whose hold has expired', () => {
    const active = order({ id: 'held', holdExpiresAt: new Date(now.getTime() + 60_000) })
    const lapsedHold = order({ id: 'lapsed-hold', holdExpiresAt: new Date(now.getTime() - 60_000) })
    expect(ordersToRetire([active, lapsedHold], scope)).toEqual(['lapsed-hold'])
  })

  it('ignores paid, fulfilled, cancelled and expired orders', () => {
    const others = (['paid_confirmed', 'fulfilled', 'cancelled', 'expired'] as const).map((status) =>
      order({ id: status, status })
    )
    expect(ordersToRetire(others, scope)).toEqual([])
  })
})
