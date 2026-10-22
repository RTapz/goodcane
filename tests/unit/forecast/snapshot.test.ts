// BR-FC10: a snapshot uses only what was known at its nominal checkpoint.
import { describe, expect, it } from 'vitest'
import { snapshotAtCheckpoint, type HistoryDrop, type PaidOrder, type PaidUnits } from '../../../server/domain/forecast'

const DAY = 24 * 60 * 60 * 1000
const cutOffAt = new Date('2026-10-20T12:00:00Z')
const checkpointAt = new Date(cutOffAt.getTime() - 3 * DAY)

/** A finished drop whose cut-off was `daysBefore` days before this drop's checkpoint. */
function pastDrop(daysBefore: number, units: number, capacity = 70): HistoryDrop {
  const dropCutOff = new Date(checkpointAt.getTime() - daysBefore * DAY)
  // Half paid 4 days before its cut-off, half paid 1 day before.
  const paid: PaidUnits[] = [
    { paidAt: new Date(dropCutOff.getTime() - 4.5 * DAY), units: units / 2 },
    { paidAt: new Date(dropCutOff.getTime() - 1.5 * DAY), units: units / 2 }
  ]
  return { cutOffAt: dropCutOff, capacity, paid, turnedAwayUnits: 0 }
}

const history = [pastDrop(20, 40), pastDrop(15, 44), pastDrop(10, 50), pastDrop(5, 52)]
const paid: PaidOrder[] = [
  { paidAt: new Date(checkpointAt.getTime() - DAY), units: 20, customerId: null, cancelledAt: null },
  { paidAt: checkpointAt, units: 5, customerId: null, cancelledAt: null } // exactly at the checkpoint: counts
]

describe('snapshotAtCheckpoint', () => {
  it('computes baseline and pace as of the checkpoint', () => {
    const snap = snapshotAtCheckpoint({ cutOffAt, checkpointDays: 3, turnedAway: [], paid, history })
    expect(snap.checkpointAt).toEqual(checkpointAt)
    expect(snap.baseline).toBe(49) // 48.6 rounded
    // Pace share at day 3 is 0.5 (half paid by 3 days before cut-off), so 25 / 0.5 = 50.
    expect(snap.pace).toBe(50)
  })

  it('a late first load gives exactly the same snapshot as an on-time one', () => {
    const onTime = snapshotAtCheckpoint({ cutOffAt, checkpointDays: 3, turnedAway: [], paid, history })
    // Later: more payments arrived after the checkpoint, an order paid before it was cancelled
    // after it, and another drop closed in between.
    const latePaid: PaidOrder[] = [
      { ...paid[0]!, cancelledAt: new Date(checkpointAt.getTime() + 2 * DAY) },
      paid[1]!,
      { paidAt: new Date(checkpointAt.getTime() + DAY), units: 30, customerId: null, cancelledAt: null }
    ]
    const lateHistory = [...history, { ...pastDrop(-1, 90), cutOffAt: new Date(checkpointAt.getTime() + DAY) }]
    const late = snapshotAtCheckpoint({ cutOffAt, checkpointDays: 3, turnedAway: [], paid: latePaid, history: lateHistory })
    expect(late).toEqual(onTime)
  })

  it('an order cancelled before the checkpoint does not count as paid at it', () => {
    const withCancelled: PaidOrder[] = [
      ...paid,
      { paidAt: new Date(checkpointAt.getTime() - 2 * DAY), units: 10, customerId: null, cancelledAt: new Date(checkpointAt.getTime() - DAY) }
    ]
    const snap = snapshotAtCheckpoint({ cutOffAt, checkpointDays: 3, turnedAway: [], paid: withCancelled, history })
    expect(snap.pace).toBe(50)
  })

  it('uses the baseline only with fewer than 4 drops closed by the checkpoint', () => {
    const snap = snapshotAtCheckpoint({ cutOffAt, checkpointDays: 3, turnedAway: [], paid, history: history.slice(1) })
    expect(snap.pace).toBeNull()
    expect(snap.baseline).not.toBeNull()
  })

  it('leaves drops that hit capacity out of the pace table, but keeps them in the baseline', () => {
    const capped = { ...pastDrop(2, 50, 50), paid: [{ paidAt: new Date(checkpointAt.getTime() - 6 * DAY), units: 50 }] }
    const withCapped = snapshotAtCheckpoint({ cutOffAt, checkpointDays: 3, turnedAway: [], paid, history: [...history, capped] })
    const without = snapshotAtCheckpoint({ cutOffAt, checkpointDays: 3, turnedAway: [], paid, history })
    expect(withCapped.pace).toBe(without.pace)
    expect(withCapped.baseline).not.toBe(without.baseline)
  })

  it('no history gives nulls, never NaN', () => {
    expect(snapshotAtCheckpoint({ cutOffAt, checkpointDays: 3, turnedAway: [], paid, history: [] })).toEqual({
      checkpointAt,
      pace: null,
      baseline: null
    })
  })

  it('counts turned-away units recorded by the checkpoint, so forecast and actual are both demand units', () => {
    const turnedAway = [
      { units: 5, customerId: null, createdAt: new Date(checkpointAt.getTime() - DAY) }, // before: counts
      { units: 7, customerId: null, createdAt: new Date(checkpointAt.getTime() + DAY) } // after: ignored
    ]
    const snap = snapshotAtCheckpoint({ cutOffAt, checkpointDays: 3, turnedAway, paid, history })
    expect(snap.pace).toBe(60) // (25 paid + 5 turned away) / 0.5
  })

  it('ignores a turned-away row whose customer had paid by the checkpoint (BR-F2)', () => {
    const paidByAma: PaidOrder[] = [{ ...paid[0]!, customerId: 'ama' }, paid[1]!]
    const turnedAway = [{ units: 5, customerId: 'ama', createdAt: new Date(checkpointAt.getTime() - 2 * DAY) }]
    const snap = snapshotAtCheckpoint({ cutOffAt, checkpointDays: 3, turnedAway, paid: paidByAma, history })
    expect(snap.pace).toBe(50)
  })

  it('keeps a turned-away row recorded after that customer had already paid (they wanted more)', () => {
    const paidByAma: PaidOrder[] = [{ ...paid[0]!, customerId: 'ama' }, paid[1]!]
    // Ama paid at checkpoint minus 1 day, then was turned away asking for more half a day later.
    const turnedAway = [{ units: 5, customerId: 'ama', createdAt: new Date(checkpointAt.getTime() - 0.5 * DAY) }]
    const snap = snapshotAtCheckpoint({ cutOffAt, checkpointDays: 3, turnedAway, paid: paidByAma, history })
    expect(snap.pace).toBe(60) // (25 paid + 5 turned away) / 0.5
  })
})
