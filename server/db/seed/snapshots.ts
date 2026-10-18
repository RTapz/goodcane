// Forecast snapshots for the completed sample drops (spec 9, BR-FC10), so the accuracy
// metric has scored drops. Pure: it turns the sample rows into the same inputs O1 uses and
// calls the same snapshotAtCheckpoint, which itself ignores anything after the checkpoint.
import { snapshotAtCheckpoint, type HistoryDrop, type PaidOrder } from '../../domain/forecast'
import type { forecastSnapshots } from '../schema'
import type { SampleData } from './build'

type WithId<T> = T & { id: string }
export type ForecastSnapshotRow = WithId<typeof forecastSnapshots.$inferInsert>

const FINAL_PAID = new Set(['paid_confirmed', 'fulfilled'])

/** Capacity-weighted units per order. */
function unitsByOrder(data: SampleData): Map<string, number> {
  const weights = new Map(data.menuItems.map((m) => [m.id, m.capacityWeight]))
  const units = new Map<string, number>()
  for (const line of data.orderItems) {
    units.set(line.orderId, (units.get(line.orderId) ?? 0) + line.quantity * (weights.get(line.menuItemId) ?? 0))
  }
  return units
}

/** Paid orders on one drop, with when each was cancelled (from its history) if it was. */
function paidOrdersOn(data: SampleData, dropId: string, units: Map<string, number>): (PaidOrder & { status: string })[] {
  const cancelledAt = new Map(
    data.orderHistory.filter((h) => h.toStatus === 'cancelled').map((h) => [h.orderId, h.createdAt as Date])
  )
  return data.orders
    .filter((o) => o.dropId === dropId && o.paidAt)
    .map((o) => ({
      status: o.status as string,
      paidAt: o.paidAt as Date,
      units: units.get(o.id) ?? 0,
      cancelledAt: cancelledAt.get(o.id) ?? null
    }))
}

export function buildSnapshots(data: SampleData, checkpointDays: number, newId: () => string): ForecastSnapshotRow[] {
  const units = unitsByOrder(data)
  const completed = data.drops
    .filter((d) => d.status === 'completed')
    .sort((a, b) => a.cutOffAt.getTime() - b.cutOffAt.getTime())

  // Every completed drop as history, with its final paid orders. Sample turned-away rows have
  // no order, so the BR-F2 dedupe has nothing to remove here.
  const history: HistoryDrop[] = completed.map((drop) => ({
    cutOffAt: drop.cutOffAt,
    capacity: drop.capacity,
    paid: paidOrdersOn(data, drop.id, units).filter((o) => FINAL_PAID.has(o.status)),
    turnedAwayUnits: data.turnedAway.filter((t) => t.dropId === drop.id).reduce((sum, t) => sum + t.units, 0)
  }))

  const rows: ForecastSnapshotRow[] = []
  for (const drop of completed) {
    const snapshot = snapshotAtCheckpoint({
      cutOffAt: drop.cutOffAt,
      checkpointDays,
      paid: paidOrdersOn(data, drop.id, units),
      history
    })
    if (snapshot.pace !== null) {
      rows.push({ id: newId(), dropId: drop.id, checkpointAt: snapshot.checkpointAt, method: 'pace', projectedUnits: snapshot.pace, isSample: true })
    }
    if (snapshot.baseline !== null) {
      rows.push({ id: newId(), dropId: drop.id, checkpointAt: snapshot.checkpointAt, method: 'baseline', projectedUnits: snapshot.baseline, isSample: true })
    }
  }
  return rows
}
