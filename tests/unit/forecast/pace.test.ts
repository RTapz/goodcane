import { describe, expect, it } from 'vitest'
import { learnPaceTable, type PaidUnits } from '../../../server/domain/forecast'

const DAY_MS = 24 * 60 * 60 * 1000
const cutOffAt = new Date('2026-10-20T12:00:00Z')

/** One payment of `units` in the middle of bucket d: [cut-off - (d+1) days, cut-off - d days). */
function paidInBucket(d: number, units: number): PaidUnits {
  return { paidAt: new Date(cutOffAt.getTime() - (d + 0.5) * DAY_MS), units }
}

// Remove `.skip` when learnPaceTable is implemented (BR-FC3).
describe.skip('learnPaceTable (BR-FC3)', () => {
  it('recovers the spec shape from one drop paid exactly 20, 15, 25, 20, 12, 8', () => {
    const paid = [
      paidInBucket(5, 20),
      paidInBucket(4, 15),
      paidInBucket(3, 25),
      paidInBucket(2, 20),
      paidInBucket(1, 12),
      paidInBucket(0, 8)
    ]
    const table = learnPaceTable([{ cutOffAt, paid }])

    expect(table[5]).toBeCloseTo(0.2)
    expect(table[4]).toBeCloseTo(0.35)
    expect(table[3]).toBeCloseTo(0.6)
    expect(table[2]).toBeCloseTo(0.8)
    expect(table[1]).toBeCloseTo(0.92)
    expect(table[0]).toBeCloseTo(1)
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

  it('weights by units, not by number of orders', () => {
    const paid = [paidInBucket(5, 3), paidInBucket(0, 1)]
    const table = learnPaceTable([{ cutOffAt, paid }])

    expect(table[5]).toBeCloseTo(0.75)
  })
})
