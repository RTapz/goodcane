import { describe, expect, it } from 'vitest'
import { learnPaceTable, type PaidUnits, type PaceTable } from '../../../server/domain/forecast'

const DAY_MS = 24 * 60 * 60 * 1000
const cutOffAt = new Date('2026-10-20T12:00:00Z')

/** One payment of `units` in the middle of bucket d: [cut-off - (d+1) days, cut-off - d days). */
function paidInBucket(d: number, units: number): PaidUnits {
  return { paidAt: new Date(cutOffAt.getTime() - (d + 0.5) * DAY_MS), units }
}

/** Payments with the given units in buckets 5, 4, 3, 2, 1, 0. */
function dropWith(unitsByBucket: number[]) {
  const paid = unitsByBucket.map((units, i) => paidInBucket(5 - i, units)).filter((p) => p.units > 0)
  return { cutOffAt, paid }
}

function expectTable(table: PaceTable, expected: [number, number, number, number, number, number]) {
  ;([5, 4, 3, 2, 1, 0] as const).forEach((day, i) => {
    expect(table[day]).toBeCloseTo(expected[i] as number)
  })
}

describe('learnPaceTable (BR-FC3)', () => {
  it('works through the small example: 2, 1, 3, 2, 1, 1 units gives 0.2, 0.3, 0.6, 0.8, 0.9, 1.0', () => {
    expectTable(learnPaceTable([dropWith([2, 1, 3, 2, 1, 1])]), [0.2, 0.3, 0.6, 0.8, 0.9, 1])
  })

  it('recovers the spec shape from one drop paid exactly 20, 15, 25, 20, 12, 8', () => {
    expectTable(learnPaceTable([dropWith([20, 15, 25, 20, 12, 8])]), [0.2, 0.35, 0.6, 0.8, 0.92, 1])
  })

  it('averages the shares across drops', () => {
    // Drop A: half paid on day 5, half on day 0. Drop B: everything on day 5.
    const dropA = { cutOffAt, paid: [paidInBucket(5, 10), paidInBucket(0, 10)] }
    const dropB = { cutOffAt, paid: [paidInBucket(5, 4)] }
    const table = learnPaceTable([dropA, dropB])

    expect(table[5]).toBeCloseTo(0.75)
    expect(table[1]).toBeCloseTo(0.75)
    expect(table[0]).toBeCloseTo(1)
  })

  it('gives each drop equal say, however big it is', () => {
    // A big drop paid all on day 5 and a small one paid all on day 0 average to 0.5 on day 5.
    const big = dropWith([100, 0, 0, 0, 0, 0])
    const small = dropWith([0, 0, 0, 0, 0, 2])
    expect(learnPaceTable([big, small])[5]).toBeCloseTo(0.5)
  })

  it('weights by units, not by number of orders', () => {
    const paid = [paidInBucket(5, 3), paidInBucket(0, 1)]
    expect(learnPaceTable([{ cutOffAt, paid }])[5]).toBeCloseTo(0.75)
  })

  it('counts a payment exactly on a day boundary in the later bucket', () => {
    // Paid exactly 5 days before cut-off: not "earlier than" day 5, so it counts from day 4.
    const paid = [{ paidAt: new Date(cutOffAt.getTime() - 5 * DAY_MS), units: 1 }]
    const table = learnPaceTable([{ cutOffAt, paid }])
    expect(table[5]).toBe(0)
    expect(table[4]).toBe(1)
  })

  it('throws a RangeError for an empty list of drops', () => {
    expect(() => learnPaceTable([])).toThrow(RangeError)
  })

  it('skips a drop with zero paid units', () => {
    const empty = { cutOffAt, paid: [] }
    const zeroUnits = { cutOffAt, paid: [paidInBucket(3, 0)] }
    const real = dropWith([2, 1, 3, 2, 1, 1])
    expectTable(learnPaceTable([empty, zeroUnits, real]), [0.2, 0.3, 0.6, 0.8, 0.9, 1])
  })

  it('throws a RangeError when every drop has zero paid units', () => {
    expect(() => learnPaceTable([{ cutOffAt, paid: [] }])).toThrow(RangeError)
  })
})
