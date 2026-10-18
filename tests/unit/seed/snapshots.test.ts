// BR-FC10 and spec 9: every seeded forecast snapshot uses only data available at its checkpoint.
import { describe, expect, it } from 'vitest'
import { buildSampleData, SEED, type SampleData } from '../../../server/db/seed/build'
import { createRand } from '../../../server/db/seed/random'
import { buildSnapshots, type ForecastSnapshotRow } from '../../../server/db/seed/snapshots'
import { settingsDefaults } from '../../../server/db/settings-defaults'

const DAY = 24 * 60 * 60 * 1000
const now = new Date('2026-10-15T09:00:00Z')
const checkpointDays = settingsDefaults.forecast_checkpoint_days
const data = buildSampleData({ rand: createRand(SEED), now })

function counter() {
  let n = 0
  return () => `id-${n++}`
}

const key = (row: ForecastSnapshotRow) => `${row.dropId}:${row.method}:${row.projectedUnits}:${(row.checkpointAt as Date).toISOString()}`

/** The sample data exactly as the database would have held it at `at`. */
function asKnownAt(source: SampleData, at: Date): SampleData {
  const t = at.getTime()
  const history = source.orderHistory.filter((h) => (h.createdAt as Date).getTime() <= t)
  const statusAt = new Map<string, string>()
  for (const h of [...history].sort((a, b) => (a.createdAt as Date).getTime() - (b.createdAt as Date).getTime())) {
    statusAt.set(h.orderId, h.toStatus)
  }
  const orders = source.orders
    .filter((o) => (o.createdAt as Date).getTime() <= t)
    .map((o) => ({
      ...o,
      status: statusAt.get(o.id) as SampleData['orders'][number]['status'],
      paidAt: o.paidAt && o.paidAt.getTime() <= t ? o.paidAt : null
    }))
  const orderIds = new Set(orders.map((o) => o.id))
  return {
    ...source,
    orders,
    orderItems: source.orderItems.filter((i) => orderIds.has(i.orderId)),
    orderHistory: history,
    turnedAway: source.turnedAway.filter((r) => (r.createdAt as Date).getTime() <= t)
  }
}

describe('seeded forecast snapshots', () => {
  it('has pace snapshots to score, and a baseline for every drop with earlier history', () => {
    const pace = data.forecastSnapshots.filter((s) => s.method === 'pace')
    expect(pace.length).toBeGreaterThanOrEqual(3)
    expect(data.forecastSnapshots.every((s) => s.isSample)).toBe(true)
  })

  it('every snapshot is the same when rebuilt from only the rows that existed at its checkpoint', () => {
    for (const snapshot of data.forecastSnapshots) {
      const known = asKnownAt(data, snapshot.checkpointAt as Date)
      const rebuilt = buildSnapshots(known, checkpointDays, counter()).find(
        (s) => s.dropId === snapshot.dropId && s.method === snapshot.method
      )
      expect(rebuilt && key(rebuilt)).toBe(key(snapshot))
    }
  })

  it('a later payment, a later cancellation or a later drop changes no snapshot', () => {
    const changed: SampleData = structuredClone(data)
    const paceDropId = data.forecastSnapshots.find((s) => s.method === 'pace')!.dropId
    const target = changed.drops.find((d) => d.id === paceDropId)!
    const afterCheckpoint = new Date(target.cutOffAt.getTime() - (checkpointDays - 1) * DAY)

    // A big order paid after the checkpoint.
    changed.orders.push({ ...changed.orders[0]!, id: 'late-order', dropId: target.id, status: 'fulfilled', paidAt: afterCheckpoint, createdAt: afterCheckpoint })
    changed.orderItems.push({ orderId: 'late-order', menuItemId: changed.menuItems[0]!.id, quantity: 40, unitPricePesewas: 1, isSample: true })
    // A paid order on that drop cancelled after the checkpoint.
    const paidBefore = changed.orders.find((o) => o.dropId === target.id && o.status === 'fulfilled' && o.paidAt!.getTime() < afterCheckpoint.getTime() - DAY)!
    paidBefore.status = 'cancelled'
    changed.orderHistory.push({ id: 'late-cancel', orderId: paidBefore.id, fromStatus: 'paid_confirmed', toStatus: 'cancelled', actor: 'owner', createdAt: afterCheckpoint, isSample: true })
    // The changed drop's own snapshot cannot see changes after its checkpoint. (Later drops'
    // checkpoints do come after them, so those may rightly see the new totals.)
    const own = (rows: ForecastSnapshotRow[]) => rows.filter((s) => s.dropId === target.id).map(key)
    expect(own(buildSnapshots(changed, checkpointDays, counter()))).toEqual(own(buildSnapshots(data, checkpointDays, counter())))
    expect(own(data.forecastSnapshots).length).toBeGreaterThan(0)

    // A drop that closes after every checkpoint changes no snapshot at all.
    const withFuture: SampleData = structuredClone(data)
    withFuture.drops.push({ ...target, id: 'future-drop', cutOffAt: new Date(now.getTime() + 30 * DAY), dropAt: new Date(now.getTime() + 33 * DAY) })
    const all = (rows: ForecastSnapshotRow[]) => rows.filter((s) => s.dropId !== 'future-drop').map(key)
    expect(all(buildSnapshots(withFuture, checkpointDays, counter()))).toEqual(all(buildSnapshots(data, checkpointDays, counter())))
  })
})
